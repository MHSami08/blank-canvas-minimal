import { useUser } from "@clerk/clerk-react";

/** Clerk publicMetadata.driveAdmin may be boolean true or the string "true". */
export function isDriveAdminMeta(meta: unknown): boolean {
  const m = (meta ?? {}) as { driveAdmin?: unknown; role?: unknown };
  if (m.driveAdmin === true) return true;
  if (typeof m.driveAdmin === "string" && m.driveAdmin.trim().toLowerCase() === "true") return true;
  return typeof m.role === "string" && m.role.trim().toLowerCase() === "admin";
}

export function useIsDriveAdmin(): boolean {
  const { user } = useUser();
  return isDriveAdminMeta(user?.publicMetadata);
}
