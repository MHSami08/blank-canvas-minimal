# Split one image list into multiple Drive folders

## Goal
A user with one pile of photos (no folders on the device) can put them in order by dragging, split the list into parts, choose a Drive folder for each part, and upload everything with one "Upload All" tap. They don't have to go through the whole process again for each folder.

## User flow
```text
Pick photos -> drag to reorder -> tap "Split here" between photos
  -> each part gets a Drive folder + name -> Upload All (existing queue)
```

## What changes
1. **Split points in the image list**
   - When you hover over or tap the gap between two images, a small "Split here" button appears.
   - Tapping it adds a divider labelled "Part 2", "Part 3", and so on. Tapping the divider's X removes it.
   - Dividers stay in place when images are dragged. They split the list by position.
   - Each part shows its image count.

2. **Settings for each part**
   - Each part has its own name field and its own "Choose folder" button, which opens the existing Drive folder browser.
   - The page number for each part is set automatically. It uses the existing folder-based numbering rule: continue after pages with the same name, otherwise start at page 1.
   - When the list has no split points, everything works exactly as it does now.

3. **One-tap upload**
   - "Add all parts to queue" turns each part into its own group in the existing upload queue.
   - After that, "Upload All" uploads them using the queue's current retry, verification, and progress handling.
   - The button stays disabled until every part has a folder. Parts still missing a folder are highlighted.

4. **Queue numbering matches the regular upload**
   - Queue page numbering will follow the same rule as the regular upload: matching name continues the numbering, a new name starts at 1. This fixes the difference noted earlier.

## Not changing
Drive login, upload speed, retries, checking that uploads arrived, duplicate detection, cropping, and user roles all stay as they are.

## Technical details
- `note-renamer.tsx`: add a `splits: string[]` state holding the item ids after which a split occurs. Render a `SplitDivider` between sortable rows, outside the dnd-kit sortable items. Work out `parts` from the list order plus the splits. Clear the splits when the list is reset.
- A new `split-parts-panel.tsx` holds each part's name and folder. It reuses the folder browser from `drive-upload.tsx`, pulled out into its own component if needed. It calls the existing `addGroup({ folderId, folderName, rangeName, files })` for each part, with `autoNumber: true` set through `setGroupAutoNumber`.
- `queue-prescan.ts`: replace `highestPage(driveFiles)` with the name-matched highest page from `upload-scan.ts`, the same helper the regular upload uses.
- For a single part, keep the current `DriveUpload` path.
