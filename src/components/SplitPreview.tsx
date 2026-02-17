import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SplitPreviewProps {
  originalSrc: string;
  resultSrc: string;
  onCopy: () => void;
  onSave: () => void;
  onReset: () => void;
  isProcessing?: boolean;
}

export function SplitPreview({
  originalSrc,
  resultSrc,
  onCopy,
  onSave,
  onReset,
  isProcessing,
}: SplitPreviewProps) {
  const [sliderPos, setSliderPos] = useState(50); // % horizontal
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.min(Math.max(pct, 2), 98));
  }, []);

  // Mouse
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDragging.current) updateSlider(e.clientX);
    };
    const onUp = () => (isDragging.current = false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [updateSlider]);

  // Touch
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => updateSlider(e.touches[0].clientX),
    [updateSlider]
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Zone image */}
      <div
        ref={containerRef}
        className="relative flex-1 rounded-xl overflow-hidden border border-border cursor-col-resize select-none"
        onMouseDown={onMouseDown}
        onTouchMove={onTouchMove}
        onTouchStart={(e) => updateSlider(e.touches[0].clientX)}
      >
        {/* Image résultat (fond damier pour transparence) */}
        <div className="absolute inset-0 checkerboard">
          <img
            src={resultSrc}
            alt="Résultat"
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Image originale (clip = côté gauche du slider) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={originalSrc}
            alt="Original"
            className="absolute inset-0 w-full h-full object-contain bg-secondary"
            draggable={false}
          />
        </div>

        {/* Ligne du slider */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 pointer-events-none"
          style={{ left: `${sliderPos}%` }}
        />

        {/* Handle (poignée) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center cursor-col-resize"
          style={{ left: `${sliderPos}%` }}
        >
          <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3" />
          </svg>
        </div>

        {/* Labels */}
        <span className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm pointer-events-none">
          Avant
        </span>
        <span className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm pointer-events-none">
          Après
        </span>

        {/* Overlay loading */}
        {isProcessing && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Traitement en cours…</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onCopy}
          disabled={isProcessing}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            "bg-secondary hover:bg-secondary/80 text-foreground",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Copier
        </button>

        <button
          onClick={onSave}
          disabled={isProcessing}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Sauvegarder
        </button>

        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nouvelle image
        </button>
      </div>
    </div>
  );
}
