import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectMeta } from "../types";
import { FileUpload } from "./file-upload";

interface Props {
  activeProjectId?: string;
  onDelete: (id: string) => void;
  onNew: (gpxText: string, filename: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  projects: ProjectMeta[];
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProjectPicker({
  projects,
  activeProjectId,
  onOpen,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  function startEdit(p: ProjectMeta) {
    setEditingId(p.id);
    setEditingName(p.name);
  }

  function commitEdit() {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleNew(gpxText: string, filename: string) {
    setShowUpload(false);
    onNew(gpxText, filename);
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.length > 0 && (
        <div className="flex flex-col gap-1 overflow-hidden">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const isEditing = editingId === p.id;
            return (
              <div
                className={`group relative flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-800"
                }`}
                key={p.id}
              >
                {isEditing ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Input
                      autoFocus
                      className="h-7 border-gray-600 bg-gray-900 text-gray-100 text-sm"
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitEdit();
                        }
                        if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                      value={editingName}
                    />
                    <Button
                      className="h-7 w-7 shrink-0 text-green-400 hover:bg-gray-700 hover:text-green-300"
                      onClick={commitEdit}
                      size="icon"
                      variant="ghost"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      className="h-7 w-7 shrink-0 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                      onClick={cancelEdit}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      className="flex min-w-0 flex-1 flex-col items-start pr-16 text-left"
                      onClick={() => onOpen(p.id)}
                      type="button"
                    >
                      <span
                        className={`w-full truncate font-medium text-sm ${isActive ? "text-gray-100" : "text-gray-300"}`}
                      >
                        {p.name}
                        {isActive && (
                          <span className="ml-2 font-normal text-gray-400 text-xs">
                            actif
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-gray-500 text-xs">
                        {p.filename} · {formatDate(p.updatedAt)}
                      </span>
                    </button>
                    <div className="absolute right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        aria-label="Renommer"
                        className="h-7 w-7 text-gray-600 hover:bg-gray-600 hover:text-gray-300"
                        onClick={() => startEdit(p)}
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        aria-label="Supprimer"
                        className="h-7 w-7 text-gray-600 hover:bg-gray-600 hover:text-red-400"
                        onClick={() => setDeleteId(p.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showUpload ? (
        <div className="mt-2">
          <FileUpload onFile={handleNew} />
          <Button
            className="mt-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            onClick={() => setShowUpload(false)}
            size="sm"
            variant="ghost"
          >
            Annuler
          </Button>
        </div>
      ) : (
        <Button
          className="border-gray-700 bg-transparent text-gray-400 hover:border-gray-500 hover:bg-gray-800 hover:text-gray-200"
          onClick={() => setShowUpload(true)}
          variant="outline"
        >
          + Nouveau projet
        </Button>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null);
          }
        }}
        open={deleteId !== null}
      >
        <AlertDialogContent className="border-gray-700 bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">
              Supprimer le projet ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {deleteId &&
                (() => {
                  const p = projects.find((x) => x.id === deleteId);
                  return p
                    ? `"${p.name}" sera supprimé définitivement.`
                    : "Ce projet sera supprimé définitivement.";
                })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 bg-transparent text-gray-400 hover:bg-gray-800">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="border-0 bg-red-700 text-white hover:bg-red-600"
              onClick={() => {
                if (deleteId) {
                  onDelete(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
