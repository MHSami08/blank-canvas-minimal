import { createFileRoute } from "@tanstack/react-router";
import { NoteRenamer } from "@/components/note-renamer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Page Renamer Pro — Rename and Upload Images" },
      {
        name: "description",
        content: "Rename, organize, download, and prepare notebook page images for Google Drive uploads.",
      },
      { property: "og:title", content: "Page Renamer Pro — Rename and Upload Images" },
      {
        property: "og:description",
        content: "Rename, organize, download, and prepare notebook page images for Google Drive uploads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NoteRenamer,
});