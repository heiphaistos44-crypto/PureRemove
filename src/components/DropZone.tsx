import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS } from "@/types";

interface DropZoneProps {
  onPaths: (paths: string[]) => void;
  onPaste: () => void;
  disabled?: boolean;
}

function isImagePath(p: string): boolean {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

export function DropZone({ onPaths, onPaste, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCount = useRef(0);

  // ── Tauri drag-drop natif (fournit les vrais chemins Windows) ────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const type = event.payload.type;
        if (type === "over") {
          setIsDragging(true);
        } else if (type === "drop") {
          setIsDragging(false);
          dragCount.current = 0;
          if (disabled) return;
          const paths = (event.payload as { type: string; paths?: string[] }).paths ?? [];
          const images = paths.filter(isImagePath);
          if (images.length > 0) onPaths(images);
        } else {
          setIsDragging(false);
          dragCount.current = 0;
        }
      })
      .then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [disabled, onPaths]);

  // ── Ctrl+V global ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !disabled) {
        e.preventDefault();
        onPaste();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPaste, disabled]);

  // ── Bouton "Parcourir" via dialog Tauri ──────────────────────────────────
  const handleBrowse = useCallback(async () => {
    if (disabled) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: ACCEPTED_EXTENSIONS as unknown as string[],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const images = paths.filter(isImagePath);
      if (images.length > 0) onPaths(images);
    } catch {
      // dialog annulé ou erreur
    }
  }, [disabled, onPaths]);

  // ── Empêche le comportement navigateur par défaut sur drop HTML5 ──────────
  const preventDefaults = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6 w-full h-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none",
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-secondary/30",
        disabled && "opacity-50 pointer-events-none"
      )}
      onDragOver={preventDefaults}
      onDragEnter={preventDefaults}
      onDragLeave={preventDefaults}
      onDrop={preventDefaults}
      onClick={handleBrowse}
    >
      {/* Icône */}
      <div className={cn(
        "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200",
        isDragging ? "bg-primary/20" : "bg-secondary"
      )}>
        <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
      </div>

      {/* Texte */}
      <div className="text-center space-y-2 px-8">
        <p className="text-foreground font-semibold text-lg">
          {isDragging ? "Déposez vos images ici" : "Glissez vos images ici"}
        </p>
        <p className="text-muted-foreground text-sm">
          ou{" "}
          <span className="text-primary font-medium">parcourez vos fichiers</span>
          {" "}— ou appuyez{" "}
          <kbd className="px-2 py-0.5 rounded bg-secondary border border-border text-xs font-mono">Ctrl+V</kbd>
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          PNG · JPG · WEBP · SVG · BMP · GIF · TIFF · ICO · TGA · HDR · QOI — fichier unique ou multiple
        </p>
      </div>
    </div>
  );
}
