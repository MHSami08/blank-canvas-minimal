# Google Drive Upload with Clerk Auth

## Overview
Rename করার পর user একটা Google Drive folder browser থেকে target subfolder বেছে সরাসরি সেখানে আপলোড করতে পারবে। শুধু Clerk-এ লগইন করা এবং `mustakim-s-student` role থাকা user-রাই আপলোড করতে পারবে। সব Drive access একটাই Service Account দিয়ে হবে — user-দের Google login লাগবে না।

## Secrets লাগবে (আমি form খুলে দিব)
- `CLERK_PUBLISHABLE_KEY` — Clerk Dashboard → API Keys
- `CLERK_SECRET_KEY` — Clerk Dashboard → API Keys
- `VITE_CLERK_PUBLISHABLE_KEY` — একই publishable key (client-এ লাগে)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — পুরো service account JSON file-এর content (paste)
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — `1JLz48HV3AFhLR0s6KR1ujrFOlSLhRWEJ` (আমি set করে দিব)

## User যা করবে
1. Clerk Dashboard-এ target user-এর **Public Metadata**-এ যোগ করবে:
   ```json
   { "role": "mustakim-s-student" }
   ```
2. Google Cloud-এ service account-এর email-টা target Drive folder-এ **Editor** হিসেবে share করবে (না করলে upload/list fail করবে)।

## UI ফ্লো
- Header-এ Clerk `<SignInButton>` / `<UserButton>` — একবার login করলে session সবসময় থাকবে (Clerk-এর default persistent session)।
- Login করা না থাকলে বা role না থাকলে upload panel দেখাবে "You don't have upload access" — বাকি rename tool আগের মতোই চলবে।
- Access থাকলে rename-এর পর নতুন "Upload to Google Drive" section:
  - Folder browser: root থেকে শুরু, folder-এ click করলে ভিতরে ঢুকবে, breadcrumb দিয়ে back করা যাবে
  - Current folder select করে "Upload here" button
  - Progress bar: X / N uploaded

## Technical

### Files
- `src/lib/clerk-role.ts` — client-side role helper (`useHasUploadRole()`)
- `src/server/drive.server.ts` — service account auth (JWT → access token), Drive REST helpers
- `src/server/drive.functions.ts` — `listDriveFolders`, `uploadImageToDrive` server functions with Clerk auth + role check
- `src/components/drive-upload.tsx` — folder browser + upload UI
- `src/components/note-renamer.tsx` — patch: render `<DriveUpload>` after rename step
- `src/routes/__root.tsx` — wrap in `<ClerkProvider>`, add sign-in header

### Server-side auth check
প্রতিটা server function-এ:
1. Clerk-এর `getAuth(request)` দিয়ে userId + sessionClaims বের করা
2. `sessionClaims.publicMetadata.role === "mustakim-s-student"` না হলে 403
3. তারপরই Drive API call

### Drive API (Service Account, no OAuth user flow)
- `google-auth-library` দিয়ে JWT signing → access token (auto-cached ~55 min)
- `GET /drive/v3/files?q='<folderId>' in parents and mimeType='application/vnd.google-apps.folder'` — subfolder list
- `POST /upload/drive/v3/files?uploadType=multipart` — file upload
- Shared Drive হলে `supportsAllDrives=true` add করব; regular folder হলেও কাজ করবে

### Persistence
Clerk-এর session token localStorage/cookie-তে থাকে, page reload-এ auto restore হয়। Logout না করা পর্যন্ত login থাকবে।

## যা করব না
- User-এর নিজের Google Drive access (App User Connector) — আপনি একটাই central Drive চেয়েছেন
- Lovable Cloud enable — Clerk + Service Account যথেষ্ট
- Rename/crop logic-এ কোনো পরিবর্তন

Approve করলে secrets-এর form খুলে দিব, তারপর build করব।