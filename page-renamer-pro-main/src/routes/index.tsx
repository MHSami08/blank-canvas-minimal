import { createFileRoute } from "@tanstack/react-router";
import { NoteRenamer } from "@/components/note-renamer";

export const Route = createFileRoute("/")({
  component: NoteRenamer,
});