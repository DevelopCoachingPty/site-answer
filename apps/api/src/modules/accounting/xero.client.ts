import { env } from "../../config/env.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";
import type { NormalizedInvoice, AccountingTokens } from "./types.js";

const XERO_AUTH_BASE = "https://login.xero.com";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

// --- OAuth ---

export function getOAuthAuthorizeUrl(orgId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.XERO_CLIENT_ID ?? "",
    redirect_uri: env.XERO_REDIRECT_URI ?? "",
    scope: "openid profile email accounting.transactions.read accounting.contacts.read offline_access",
    state: `xero:${orgId}`,
  });

  return `${XERO_AUTH_BASE}/identity/connect/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<AccountingTokens> {
  const credentials = Buffer.from(
    `${env.XERO_CLIENT_ID ?? ""}:${env.XERO_CLIENT_SECRET ?? ""}`,
  ).toString("base64");

  const response = await fetch(`${XERO_AUTH_BASE}/identity/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.XERO_REDIRECT_URI ?? "",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError("Xero", `Token exchange failed: ${body}`);
  }

  const tokens = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    id_token: string;
  };

  // Get tenant ID from connections endpoint
  const connectionsRes = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  const connections = await connectionsRes.json() as Array<{ tenantId: string }>;
  const tenantId = connections[0]?.tenantId;

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    tenant_id: tenantId,
  };
}

export async function storeTokens(orgId: string, tokens: AccountingTokens) {
  await supabaseAdmin
    .from("organisations")
    .update({
      accounting_type: "xero",
      accounting_credentials_encrypted: encrypt(tokens.access_token),
      accounting_refresh_token_encrypted: encrypt(tokens.refresh_token),
      accounting_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      accounting_tenant_id: tokens.tenant_id,
    })
    .eq("id", orgId);
}

async function refreshTokens(orgId: string): Promise<string> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("accounting_refresh_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.accounting_refresh_token_encrypted) {
    throw new ExternalServiceError("Xero", "No refresh token found");
  }

  const refreshToken = decrypt(org.accounting_refresh_token_encrypted);
  const credentials = Buffer.from(
    `${env.XERO_CLIENT_ID ?? ""}:${env.XERO_CLIENT_SECRET ?? ""}`,
  ).toString("base64");

  const response = await fetch(`${XERO_AUTH_BASE}/identity/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new ExternalServiceError("Xero", "Token refresh failed");
  }

  const tokens = await response.json() as AccountingTokens;
  await storeTokens(orgId, { ...tokens, tenant_id: undefined });

  return tokens.access_token;
}

async function xeroFetch(
  orgId: string,
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("accounting_credentials_encrypted, accounting_tenant_id")
    .eq("id", orgId)
    .single();

  if (!org?.accounting_credentials_encrypted) {
    throw new ExternalServiceError("Xero", "Not connected");
  }

  let accessToken = decrypt(org.accounting_credentials_encrypted);

  const response = await fetch(`${XERO_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": org.accounting_tenant_id ?? "",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 && !retried) {
    logger.info({ orgId }, "Xero token expired, refreshing");
    accessToken = await refreshTokens(orgId);
    return xeroFetch(orgId, path, options, true);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({ orgId, path, status: response.status, body }, "Xero API error");
    throw new ExternalServiceError("Xero", `API call failed (${response.status})`);
  }

  return response;
}

// --- Invoice Operations ---

export async function getOverdueInvoices(orgId: string): Promise<NormalizedInvoice[]> {
  const today = new Date().toISOString().split("T")[0]!;

  const response = await xeroFetch(
    orgId,
    `/Invoices?where=AmountDue>0 AND DueDate<DateTime(${today.replace(/-/g, ",")})&Statuses=AUTHORISED`,
  );

  const data = await response.json() as {
    Invoices: Array<{
      InvoiceID: string;
      InvoiceNumber: string;
      Contact: { Name: string; Phones?: Array<{ PhoneNumber: string; PhoneType: string }>; EmailAddress?: string };
      AmountDue: number;
      DueDateString: string;
    }>;
  };

  return (data.Invoices ?? []).map((inv) => {
    const phone = inv.Contact?.Phones?.find((p) => p.PhoneType === "DEFAULT")?.PhoneNumber
      ?? inv.Contact?.Phones?.[0]?.PhoneNumber
      ?? "";

    const dueDate = inv.DueDateString;
    const daysOverdue = Math.floor(
      (Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      external_id: inv.InvoiceID,
      provider: "xero" as const,
      contact_name: inv.Contact?.Name ?? "Unknown",
      contact_phone: phone,
      contact_email: inv.Contact?.EmailAddress,
      invoice_reference: inv.InvoiceNumber,
      amount_due: inv.AmountDue,
      due_date: dueDate,
      days_overdue: Math.max(0, daysOverdue),
    };
  });
}

export async function checkConnection(orgId: string): Promise<boolean> {
  const { data: org } = await supabaseAdmin
    .from("organisations")
    .select("accounting_credentials_encrypted, accounting_type")
    .eq("id", orgId)
    .single();

  return org?.accounting_type === "xero" && !!org.accounting_credentials_encrypted;
}

export async function disconnect(orgId: string) {
  await supabaseAdmin
    .from("organisations")
    .update({
      accounting_type: null,
      accounting_credentials_encrypted: null,
      accounting_refresh_token_encrypted: null,
      accounting_token_expires_at: null,
      accounting_tenant_id: null,
    })
    .eq("id", orgId);
}
