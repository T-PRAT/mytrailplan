import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  onFile: (text: string, name: string) => void;
}

export function FileUpload({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => onFile(e.target?.result as string, file.name);
    reader.readAsText(file);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    readFile(files[0]);
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: label drop-zone requires drag event handlers
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-16 transition-colors ${dragging ? "border-blue-400 bg-blue-950" : "border-gray-600 bg-gray-900 hover:border-gray-500 hover:bg-gray-800"}`}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <svg
        aria-hidden="true"
        className="h-12 w-12 text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      </svg>
      <div className="text-center">
        <p className="font-medium text-gray-300 text-lg">
          Déposez votre fichier GPX ici
        </p>
        <p className="mt-1 text-gray-500 text-sm">
          ou cliquez pour sélectionner
        </p>
      </div>
      <Button
        className="border-gray-600 bg-transparent text-gray-400 hover:border-gray-500 hover:bg-gray-700 hover:text-gray-200"
        onClick={(e) => e.stopPropagation()}
        size="sm"
        type="button"
        variant="outline"
      >
        Parcourir les fichiers
      </Button>
      <input
        accept=".gpx"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        ref={inputRef}
        type="file"
      />
    </label>
  );
}
