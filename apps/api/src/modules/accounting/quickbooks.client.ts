import { env } from "../../config/env.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import { ExternalServiceError } from "../../lib/errors.js";
import type { NormalizedInvoice, AccountingTokens } from "./types.js";

const QB_AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3";

// --- OAuth ---

export function getOAuthAuthorizeUrl(orgId: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.QB_CLIENT_ID ?? "",
    redirect_uri: env.QB_REDIRECT_URI ?? "",
    scope: "com.intuit.quickbooks.accounting",
    state: `quickbooks:${orgId}`,
  });

  return `${QB_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, realmId: string): Promise<AccountingTokens> {
  const credentials = Buffer.from(
    `${env.QB_CLIENT_ID ?? ""}:${env.QB_CLIENT_SECRET ?? ""}`,
  ).toString("base64");

  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.QB_REDIRECT_URI ?? "",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ExternalServiceError("QuickBooks", `Token exchange failed: ${body}`);
  }

  const tokens = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    tenant_id: realmId,
  };
}

export async function storeTokens(orgId: string, tokens: AccountingTokens) {
  await supabaseAdmin
    .from("organisations")
    .update({
      accounting_type: "quickbooks",
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
    throw new ExternalServiceError("QuickBooks", "No refresh token found");
  }

  const refreshToken = decrypt(org.accounting_refresh_token_encrypted);
  const credentials = Buffer.from(
    `${env.QB_CLIENT_ID ?? ""}:${env.QB_CLIENT_SECRET ?? ""}`,
  ).toString("base64");

  const response = await fetch(QB_TOKEN_URL, {
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
    throw new ExternalServiceError("QuickBooks", "Token refresh failed");
  }

  const tokens = await response.json() as AccountingTokens;
  await storeTokens(orgId, { ...tokens, tenant_id: undefined });

  return tokens.access_token;
}

async function qbFetch(
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

  if (!org?.accounting_credentials_encrypted || !org.accounting_tenant_id) {
    throw new ExternalServiceError("QuickBooks", "Not connected");
  }

  let accessToken = decrypt(org.accounting_credentials_encrypted);

  const response = await fetch(`${QB_API_BASE}/company/${org.accounting_tenant_id}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 && !retried) {
    logger.info({ orgId }, "QuickBooks token expired, refreshing");
    accessToken = await refreshTokens(orgId);
    return qbFetch(orgId, path, options, true);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({ orgId, path, status: response.status, body }, "QuickBooks API error");
    throw new ExternalServiceError("QuickBooks", `API call failed (${response.status})`);
  }

  return response;
}

// --- Invoice Operations ---

export async function getOverdueInvoices(orgId: string): Promise<NormalizedInvoice[]> {
  const today = new Date().toISOString().split("T")[0]!;

  const query = encodeURIComponent(
    `SELECT * FROM Invoice WHERE Balance > '0' AND DueDate < '${today}'`,
  );

  const response = await qbFetch(orgId, `/query?query=${query}`);

  const data = await response.json() as {
    QueryResponse: {
      Invoice?: Array<{
        Id: string;
        DocNumber: string;
        CustomerRef: { name: string; value: string };
        Balance: number;
        DueDate: string;
        BillEmail?: { Address: string };
      }>;
    };
  };

  const invoices = data.QueryResponse?.Invoice ?? [];

  // Fetch customer phone numbers in bulk
  const customerIds = [...new Set(invoices.map((inv) => inv.CustomerRef.value))];
  const phoneMap = new Map<string, string>();

  for (const customerId of customerIds) {
    try {
      const custResponse = await qbFetch(orgId, `/customer/${customerId}`);
      const custData = await custResponse.json() as {
        Customer: { PrimaryPhone?: { FreeFormNumber: string }; Mobile?: { FreeFormNumber: string } };
      };
      const phone = custData.Customer?.Mobile?.FreeFormNumber
        ?? custData.Customer?.PrimaryPhone?.FreeFormNumber
        ?? "";
      phoneMap.set(customerId, phone);
    } catch {
      phoneMap.set(customerId, "");
    }
  }

  return invoices.map((inv) => {
    const daysOverdue = Math.floor(
      (Date.now() - new Date(inv.DueDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      external_id: inv.Id,
      provider: "quickbooks" as const,
      contact_name: inv.CustomerRef.name,
      contact_phone: phoneMap.get(inv.CustomerRef.value) ?? "",
      contact_email: inv.BillEmail?.Address,
      invoice_reference: inv.DocNumber,
      amount_due: inv.Balance,
      due_date: inv.DueDate,
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

  return org?.accounting_type === "quickbooks" && !!org.accounting_credentials_encrypted;
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
