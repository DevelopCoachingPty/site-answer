export interface NormalizedInvoice {
  external_id: string;
  provider: "xero" | "quickbooks";
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  invoice_reference: string;
  amount_due: number;
  due_date: string; // ISO date
  days_overdue: number;
}

export interface AccountingTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  tenant_id?: string;
}

export interface SyncResult {
  invoices_found: number;
  invoices_synced: number;
  invoices_resolved: number;
}
