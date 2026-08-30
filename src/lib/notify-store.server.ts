// Minimal in-memory notification ledger (no database in this project).
// Purpose: server-side duplicate protection for one-email-per-batch.
export type NotificationStatus = "sending" | "sent" | "failed";

export type NotificationRecord = {
  batchId: string;
  clerkUserId: string;
  userName: string;
  userEmail: string;
  batchName: string;
  rangeName?: string | null;
  pageRange?: { start: string; end: string } | null;
  imageCount: number;
  status: NotificationStatus;
  createdAt: number;
  sentAt?: number;
  error?: string;
};

const records = new Map<string, NotificationRecord>();
const TTL_MS = 24 * 60 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of records) if (v.createdAt < cutoff) records.delete(k);
}

export function getRecord(batchId: string): NotificationRecord | undefined {
  prune();
  return records.get(batchId);
}

export function beginRecord(r: Omit<NotificationRecord, "status" | "createdAt">): NotificationRecord {
  const rec: NotificationRecord = { ...r, status: "sending", createdAt: Date.now() };
  records.set(r.batchId, rec);
  return rec;
}

export function markSent(batchId: string) {
  const r = records.get(batchId);
  if (r) {
    r.status = "sent";
    r.sentAt = Date.now();
  }
}

export function markFailed(batchId: string, error: string) {
  const r = records.get(batchId);
  if (r) {
    r.status = "failed";
    r.error = error;
  }
}

export function listRecords(): NotificationRecord[] {
  prune();
  return Array.from(records.values()).sort((a, b) => b.createdAt - a.createdAt);
}
