import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import type { ProjectMeta } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUpload } from './FileUpload';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  projects: ProjectMeta[];
  activeProjectId?: string;
  onOpen: (id: string) => void;
  onNew: (gpxText: string, filename: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectPicker({ projects, activeProjectId, onOpen, onNew, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
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
          {projects.map(p => {
            const isActive = p.id === activeProjectId;
            const isEditing = editingId === p.id;
            return (
              <div
                key={p.id}
                className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg group transition-colors ${
                  isActive ? 'bg-gray-700' : 'hover:bg-gray-800'
                }`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Input
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="h-7 text-sm bg-gray-900 border-gray-600 text-gray-100"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" onClick={commitEdit} className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-gray-700 shrink-0">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-7 w-7 text-gray-500 hover:text-gray-300 hover:bg-gray-700 shrink-0">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      className="flex flex-col items-start flex-1 min-w-0 text-left pr-16"
                      onClick={() => onOpen(p.id)}
                    >
                      <span className={`text-sm font-medium truncate w-full ${isActive ? 'text-gray-100' : 'text-gray-300'}`}>
                        {p.name}
                        {isActive && <span className="ml-2 text-xs text-gray-400 font-normal">actif</span>}
                      </span>
                      <span className="text-xs text-gray-500 truncate w-full">{p.filename} · {formatDate(p.updatedAt)}</span>
                    </button>
                    <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => startEdit(p)}
                        className="h-7 w-7 text-gray-600 hover:text-gray-300 hover:bg-gray-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setDeleteId(p.id)}
                        className="h-7 w-7 text-gray-600 hover:text-red-400 hover:bg-gray-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
          <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)} className="mt-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800">
            Annuler
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="border-gray-700 bg-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200 hover:border-gray-500"
          onClick={() => setShowUpload(true)}
        >
          + Nouveau projet
        </Button>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">Supprimer le projet ?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {deleteId && (() => {
                const p = projects.find(x => x.id === deleteId);
                return p ? `"${p.name}" sera supprimé définitivement.` : 'Ce projet sera supprimé définitivement.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-700 bg-transparent text-gray-400 hover:bg-gray-800">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-600 text-white border-0"
              onClick={() => { if (deleteId) { onDelete(deleteId); setDeleteId(null); } }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
