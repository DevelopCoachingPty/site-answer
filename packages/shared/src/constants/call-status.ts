export const CALL_STATUSES = [
  "ringing",
  "in_progress",
  "completed",
  "failed",
  "missed",
  "voicemail",
] as const;

export const CALL_FLOW_TYPES = [
  "new_inquiry",
  "existing_client",
  "payment_query",
  "after_hours",
  "supplier_subcontractor",
  "unknown",
] as const;

export const EMERGENCY_KEYWORDS = [
  "flood",
  "leak",
  "collapse",
  "fire",
  "structural",
  "dangerous",
  "urgent",
  "emergency",
  "gas",
  "electric",
  "electrocution",
] as const;

export const MAX_CALL_DURATION_SECONDS = 600; // 10 minutes
