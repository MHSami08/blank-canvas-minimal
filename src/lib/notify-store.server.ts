// Server-only notification log + de-duplication.
// The project has no database, so records live in the server runtime memory.
// De-duplication is keyed by a deterministic batch id (folder + file names),
// so a browser refresh or retry can never produce a second email.

export type NotificationStatus = "pending" | "sending" | "sent" | "failed";

export type NotificationRecord = {
  id: string;
  batchId: string;
  clerkUserId: string;
  userName: string;
  userEmail: string;
  batchName: string;
  imageCount: number;
  uploadDate: string;
  uploadTime: string;
  notificationStatus: NotificationStatus;
  notificationSentAt: string | null;
  error?: string;
  createdAt: string;
};

const records = new Map<string, NotificationRecord>(); // batchId -> record
const MAX = 200;

export function getRecord(batchId: string) {
  return records.get(batchId);
}

export function listRecords(): NotificationRecord[] {
  return Array.from(records.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsert(rec: NotificationRecord) {
  records.set(rec.batchId, rec);
  if (records.size > MAX) {
    const oldest = listRecords().slice(MAX);
    for (const r of oldest) records.delete(r.batchId);
  }
  return rec;
}

export function setStatus(batchId: string, status: NotificationStatus, error?: string) {
  const rec = records.get(batchId);
  if (!rec) return;
  rec.notificationStatus = status;
  rec.error = error;
  if (status === "sent") rec.notificationSentAt = new Date().toISOString();
}
