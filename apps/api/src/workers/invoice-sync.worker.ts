/**
 * Invoice Sync Worker
 *
 * Syncs overdue invoices from Xero/QuickBooks into the payment chase queue.
 * Runs daily on weekdays at 8am, or on-demand via manual sync trigger.
 */

import { Worker, type Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";
import { QUEUE_NAMES } from "../config/constants.js";
import { getQueue } from "../lib/queue.js";
import { supabaseAdmin } from "../lib/supabase.js";
import * as xeroClient from "../modules/accounting/xero.client.js";
import * as qbClient from "../modules/accounting/quickbooks.client.js";
import * as chaseService from "../modules/payment-chase/chase.service.js";
import type { NormalizedInvoice, SyncResult } from "../modules/accounting/types.js";

interface InvoiceSyncJob {
  organisationId: string;
  syncType: "overdue_invoices" | "manual";
}

async function processInvoiceSync(job: Job<InvoiceSyncJob | Record<string, never>>) {
  const log = logger.child({ jobId: job.id, jobName: job.name });

  if (job.name === "sync-scheduler") {
    log.info("Running invoice sync scheduler");

    // Find all orgs with accounting connected
    const { data: orgs } = await supabaseAdmin
      .from("organisations")
      .select("id, accounting_type")
      .not("accounting_type", "is", null)
      .not("accounting_credentials_encrypted", "is", null);

    if (!orgs?.length) {
      log.info("No organisations with accounting connected");
      return { scheduled: 0 };
    }

    const syncQueue = getQueue(QUEUE_NAMES.INVOICE_SYNC);
    for (const org of orgs) {
      await syncQueue.add("sync-org", {
        organisationId: org.id,
        syncType: "overdue_invoices",
      } as InvoiceSyncJob, {
        attempts: 2,
        backoff: { type: "exponential", delay: 10000 },
        jobId: `sync-${org.id}-${new Date().toISOString().split("T")[0]}`,
      });
    }

    return { scheduled: orgs.length };
  }

  // Individual org sync
  const data = job.data as InvoiceSyncJob;
  if (!data.organisationId) return;

  log.info({ orgId: data.organisationId }, "Syncing invoices for organisation");

  // Create sync log entry
  const { data: syncLog } = await supabaseAdmin
    .from("accounting_sync_log")
    .insert({
      organisation_id: data.organisationId,
      provider: "xero", // Will be updated below
      sync_type: data.syncType ?? "overdue_invoices",
      status: "running",
    })
    .select()
    .single();

  try {
    // Determine provider
    const { data: org } = await supabaseAdmin
      .from("organisations")
      .select("accounting_type")
      .eq("id", data.organisationId)
      .single();

    if (!org?.accounting_type) {
      throw new Error("No accounting provider connected");
    }

    // Update sync log with correct provider
    if (syncLog) {
      await supabaseAdmin
        .from("accounting_sync_log")
        .update({ provider: org.accounting_type })
        .eq("id", syncLog.id);
    }

    // Fetch overdue invoices
    let invoices: NormalizedInvoice[];
    if (org.accounting_type === "xero") {
      invoices = await xeroClient.getOverdueInvoices(data.organisationId);
    } else if (org.accounting_type === "quickbooks") {
      invoices = await qbClient.getOverdueInvoices(data.organisationId);
    } else {
      throw new Error(`Unsupported provider: ${org.accounting_type}`);
    }

    log.info({ count: invoices.length }, "Fetched overdue invoices");

    // Upsert into payment chase queue (deduplicate by external_invoice_id)
    const result = await syncInvoicesToChaseQueue(data.organisationId, invoices);

    // Update sync log
    if (syncLog) {
      await supabaseAdmin
        .from("accounting_sync_log")
        .update({
          status: "completed",
          invoices_found: result.invoices_found,
          invoices_synced: result.invoices_synced,
          invoices_resolved: result.invoices_resolved,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    log.info({ orgId: data.organisationId, ...result }, "Invoice sync completed");
    return result;
  } catch (err) {
    log.error({ err, orgId: data.organisationId }, "Invoice sync failed");

    if (syncLog) {
      await supabaseAdmin
        .from("accounting_sync_log")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    throw err;
  }
}

async function syncInvoicesToChaseQueue(
  orgId: string,
  invoices: NormalizedInvoice[],
): Promise<SyncResult> {
  let synced = 0;
  let resolved = 0;

  // Get existing chase items with external IDs for this org
  const { data: existing } = await supabaseAdmin
    .from("payment_chase_queue")
    .select("id, external_invoice_id, status")
    .eq("organisation_id", orgId)
    .not("external_invoice_id", "is", null);

  const existingMap = new Map(
    (existing ?? []).map((e) => [e.external_invoice_id, e]),
  );

  const externalIds = new Set(invoices.map((inv) => inv.external_id));

  // Create new items for invoices not already in the queue
  const newItems = invoices.filter((inv) => {
    const existingItem = existingMap.get(inv.external_id);
    if (!existingItem) return true;
    // Skip if already resolved
    return ["paid", "disputed"].includes(existingItem.status);
  });

  if (newItems.length > 0) {
    const items = newItems
      .filter((inv) => inv.contact_phone) // Only create items with phone numbers
      .map((inv) => ({
        contact_name: inv.contact_name,
        contact_phone: inv.contact_phone,
        invoice_reference: inv.invoice_reference,
        amount_due: inv.amount_due,
        days_overdue: inv.days_overdue,
        due_date: inv.due_date,
        external_invoice_id: inv.external_id,
        accounting_provider: inv.provider,
      }));

    if (items.length > 0) {
      const created = await chaseService.bulkCreateChaseItems(orgId, items);
      synced = created.length;
    }
  }

  // Mark chase items as paid if their invoice is no longer overdue (removed from the list)
  for (const [externalId, existingItem] of existingMap) {
    if (
      !externalIds.has(externalId) &&
      !["paid", "disputed", "escalated"].includes(existingItem.status)
    ) {
      await chaseService.updateChaseItem(orgId, existingItem.id, { status: "paid" });
      resolved++;
    }
  }

  return {
    invoices_found: invoices.length,
    invoices_synced: synced,
    invoices_resolved: resolved,
  };
}

export function startInvoiceSyncWorker() {
  const worker = new Worker(
    QUEUE_NAMES.INVOICE_SYNC,
    processInvoiceSync,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2,
    },
  );

  // Schedule daily sync (weekdays at 8am via cron)
  const syncQueue = getQueue(QUEUE_NAMES.INVOICE_SYNC);
  syncQueue.add("sync-scheduler", {}, {
    repeat: {
      pattern: "0 8 * * 1-5", // Mon-Fri at 8am
    },
    jobId: "invoice-sync-scheduler",
  }).catch((err) => {
    logger.error({ err }, "Failed to set up invoice sync scheduler");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "Invoice sync job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, "Invoice sync job failed");
  });

  return worker;
}
