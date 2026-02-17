import { cn } from "@/lib/utils";
import type { ImageItem } from "@/types";

interface BatchListProps {
  items: ImageItem[];
  onSaveAll: () => void;
  onSaveOne: (item: ImageItem) => void;
  onReset: () => void;
  isSaving?: boolean;
}

export function BatchList({ items, onSaveAll, onSaveOne, onReset, isSaving }: BatchListProps) {
  const done = items.filter((i) => i.status === "done").length;
  const total = items.length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const allDone = done === total && total > 0;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-base">
            Traitement en lot
          </h2>
          <p className="text-muted-foreground text-sm">
            {done} / {total} image{total > 1 ? "s" : ""} traitée{done > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Tout effacer
        </button>
      </div>

      {/* Barre de progression globale */}
      <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Liste scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border hover:border-primary/30 transition-colors"
          >
            {/* Miniature / statut */}
            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
              {item.status === "done" && item.resultDataUrl ? (
                <img
                  src={item.resultDataUrl}
                  alt={item.name}
                  className="w-full h-full object-cover checkerboard"
                />
              ) : item.status === "processing" ? (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : item.status === "error" ? (
                <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                </svg>
              )}
            </div>

            {/* Nom + état */}
            <div className="flex-1 min-w-0">
              <p className="text-foreground text-sm font-medium truncate">{item.name}</p>
              <p className={cn(
                "text-xs mt-0.5",
                item.status === "done" && "text-green-400",
                item.status === "error" && "text-destructive",
                item.status === "processing" && "text-primary",
                item.status === "pending" && "text-muted-foreground",
              )}>
                {item.status === "done" && "Terminé"}
                {item.status === "error" && (item.error ?? "Erreur")}
                {item.status === "processing" && "Traitement…"}
                {item.status === "pending" && "En attente"}
              </p>
            </div>

            {/* Badge + action */}
            <div className="flex items-center gap-2">
              {item.status === "done" && (
                <>
                  <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                  <button
                    onClick={() => onSaveOne(item)}
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    title="Sauvegarder"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bouton Tout sauvegarder */}
      {allDone && (
        <button
          onClick={onSaveAll}
          disabled={isSaving}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              Sauvegarde en cours…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tout sauvegarder dans un dossier
            </>
          )}
        </button>
      )}
    </div>
  );
}
