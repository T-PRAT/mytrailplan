import { useRef, useState } from 'react';

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
    if (!files || files.length === 0) return;
    readFile(files[0]);
  }

  return (
    <div
      className={`
        flex flex-col items-center justify-center gap-4
        border-2 border-dashed rounded-2xl p-16
        cursor-pointer transition-colors
        ${dragging ? 'border-blue-400 bg-blue-950' : 'border-gray-600 bg-gray-900 hover:border-gray-500 hover:bg-gray-800'}
      `}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12" />
      </svg>
      <div className="text-center">
        <p className="text-lg font-medium text-gray-300">Déposez votre fichier GPX ici</p>
        <p className="text-sm text-gray-500 mt-1">ou cliquez pour sélectionner</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
