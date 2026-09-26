# Mobile upload UI cleanup

## Changes
- After files are renamed, hide the original image picker, image list, rename settings, and rename button so the mobile page stays compact.
- Shorten the starting-page field to “Starting page”, show automatic numbering in the field, and place “Optional” as a small supporting label instead of a long floating label.
- Remove the second starting-page override field from the Google Drive upload area; automatic folder-based numbering remains unchanged.
- Truncate long queue/upload button text with an ellipsis on narrow screens while retaining the full accessible label.
- After an upload completes, keep only the success summary and remove buttons that invite another upload or restart the session.
- Remove the mobile bottom-edge white strip and position the initial upload picker slightly above the vertical center when the page is otherwise empty.

## Technical notes
- Changes are presentation-only in `note-renamer`, `drive-upload`, `upload-queue-panel`, and global page styling.
- Existing Drive authentication, upload behavior, queue logic, retries, verification, renaming, and cropping remain unchanged.
- Verify the result at the current mobile viewport and confirm the preview remains error-free.
