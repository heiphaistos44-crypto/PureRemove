import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { DropZone } from "@/components/DropZone";
import { SplitPreview } from "@/components/SplitPreview";
import { BatchList } from "@/components/BatchList";
import { OutputOptions } from "@/components/OutputOptions";
import { generateId } from "@/lib/utils";
import type { AppMode, BackgroundColor, BatchProgressEvent, ImageItem, ProcessOptions } from "@/types";

// ─── Types locaux ────────────────────────────────────────────────────────────

interface SingleState {
  sourceDataUrl: string;
  sourcePath: string;
  resultDataUrl: string;
  isProcessing: boolean;
}

// ─── Utilitaire : sérialise n'importe quelle erreur en string lisible ─────────
function toMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode, setMode] = useState<AppMode>("idle");
  const [single, setSingle] = useState<SingleState | null>(null);
  const [batchItems, setBatchItems] = useState<ImageItem[]>([]);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [background, setBackground] = useState<BackgroundColor>({ type: "Transparent" });

  // Source originale mémorisée pour retraitement quand le fond change
  const singleSourceRef = useRef<{ path: string; dataUrl: string } | null>(null);
  const bgInitRef = useRef(true); // Évite le retraitement au 1er rendu
  const batchUnlistenRef = useRef<(() => void) | null>(null);

  // ── Vérification modèle au démarrage ────────────────────────────────────
  useEffect(() => {
    invoke<string>("check_model").catch((e) => setModelError(toMsg(e)));
  }, []);

  // ── Cleanup listener batch ───────────────────────────────────────────────
  useEffect(() => () => { batchUnlistenRef.current?.(); }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getOptions = useCallback((): ProcessOptions => ({ background }), [background]);

  const showError = useCallback((msg: string) => {
    setGlobalError(msg);
    setTimeout(() => setGlobalError(null), 7000);
  }, []);

  // ── Process single ────────────────────────────────────────────────────────

  const processSinglePath = useCallback(async (path: string, previewDataUrl: string) => {
    singleSourceRef.current = { path, dataUrl: previewDataUrl };
    setMode("single");
    setSingle({ sourceDataUrl: previewDataUrl, sourcePath: path, resultDataUrl: "", isProcessing: true });

    try {
      const result = await invoke<string>("process_single_image", {
        path,
        options: getOptions(),
      });
      setSingle((prev) => prev ? { ...prev, resultDataUrl: result, isProcessing: false } : null);
    } catch (e) {
      showError(`Erreur de traitement : ${toMsg(e)}`);
      setSingle((prev) => prev ? { ...prev, isProcessing: false } : null);
    }
  }, [getOptions, showError]);

  // ── Retraitement clipboard quand le fond change ──────────────────────────
  const reprocessClipboard = useCallback(async () => {
    setSingle((prev) => prev ? { ...prev, isProcessing: true } : null);
    try {
      const result = await invoke<string>("reprocess_clipboard_image", { options: getOptions() });
      setSingle((prev) => prev ? { ...prev, resultDataUrl: result, isProcessing: false } : null);
    } catch (e) {
      showError(`Erreur retraitement clipboard : ${toMsg(e)}`);
      setSingle((prev) => prev ? { ...prev, isProcessing: false } : null);
    }
  }, [getOptions, showError]);

  // ── Retraitement auto quand le fond change ────────────────────────────────
  useEffect(() => {
    if (bgInitRef.current) { bgInitRef.current = false; return; }
    const src = singleSourceRef.current;
    if (src && mode === "single") {
      if (src.path === "") {
        // Image clipboard — retraite côté Rust sans relire le presse-papier
        reprocessClipboard();
      } else {
        processSinglePath(src.path, src.dataUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background]);

  // ── Clipboard ─────────────────────────────────────────────────────────────

  const processClipboard = useCallback(async () => {
    setMode("single");
    setSingle({ sourceDataUrl: "", sourcePath: "", resultDataUrl: "", isProcessing: true });
    try {
      const result = await invoke<string>("process_clipboard_image", { options: getOptions() });
      singleSourceRef.current = { path: "", dataUrl: result };
      setSingle({ sourceDataUrl: result, sourcePath: "", resultDataUrl: result, isProcessing: false });
    } catch (e) {
      showError(`Erreur clipboard : ${toMsg(e)}`);
      setMode("idle");
      setSingle(null);
    }
  }, [getOptions, showError]);

  // ── Batch ─────────────────────────────────────────────────────────────────

  const processBatch = useCallback(async (paths: string[]) => {
    singleSourceRef.current = null;
    const items: ImageItem[] = paths.map((p) => ({
      id: generateId(),
      name: p.split(/[\\/]/).pop() ?? p,
      sourcePath: p,
      status: "pending",
    }));
    setBatchItems(items);
    setMode("batch");

    batchUnlistenRef.current?.();
    const unlisten = await listen<BatchProgressEvent>("batch-progress", (event) => {
      const { index, result_data_url, error } = event.payload;
      setBatchItems((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, status: error ? "error" : "done", resultDataUrl: result_data_url, error } : item
        )
      );
    });
    batchUnlistenRef.current = unlisten;

    setBatchItems((prev) => prev.map((item) => ({ ...item, status: "processing" })));

    try {
      await invoke("process_batch_images", { paths, options: getOptions() });
    } catch (e) {
      showError(`Erreur batch : ${toMsg(e)}`);
    }
  }, [getOptions, showError]);

  // ── Dispatch fichiers (Tauri donne des paths Windows complets) ────────────

  const handlePaths = useCallback(async (paths: string[]) => {
    if (paths.length === 1) {
      // convertFileSrc : transforme "C:\...\photo.jpg" en URL asset:// lisible par le webview
      const preview = convertFileSrc(paths[0]);
      await processSinglePath(paths[0], preview);
    } else {
      await processBatch(paths);
    }
  }, [processSinglePath, processBatch]);

  // ── Actions single ────────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!single?.resultDataUrl) return;
    try {
      await invoke("copy_result_to_clipboard", { dataUrl: single.resultDataUrl });
    } catch (e) { showError(`Copie échouée : ${toMsg(e)}`); }
  }, [single, showError]);

  const handleSaveSingle = useCallback(async () => {
    if (!single?.resultDataUrl) return;
    const baseName = single.sourcePath
      ? (single.sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "output")
      : "output";

    try {
      const dest = await save({
        defaultPath: `${baseName}_nobg.png`,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!dest) return; // Annulé par l'utilisateur

      await invoke("save_result_to_file", {
        dataUrl: single.resultDataUrl,
        destPath: dest,
      });
    } catch (e) {
      showError(`Sauvegarde échouée : ${toMsg(e)}`);
    }
  }, [single, showError]);

  const handleReset = useCallback(() => {
    batchUnlistenRef.current?.();
    singleSourceRef.current = null;
    setMode("idle");
    setSingle(null);
    setBatchItems([]);
  }, []);

  // ── Actions batch ─────────────────────────────────────────────────────────

  const handleSaveOne = useCallback(async (item: ImageItem) => {
    if (!item.resultDataUrl) return;
    const stem = item.name.replace(/\.[^.]+$/, "");
    try {
      const dest = await save({
        defaultPath: `${stem}_nobg.png`,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!dest) return;
      await invoke("save_result_to_file", { dataUrl: item.resultDataUrl, destPath: dest });
    } catch (e) { showError(`Sauvegarde échouée : ${toMsg(e)}`); }
  }, [showError]);

  const handleSaveAll = useCallback(async () => {
    const doneItems = batchItems.filter((i) => i.status === "done" && i.resultDataUrl);
    if (doneItems.length === 0) return;

    try {
      const folder = await open({ directory: true, title: "Choisir le dossier de sortie" });
      if (!folder || typeof folder !== "string") return;

      setIsSavingBatch(true);
      const items: [string, string][] = doneItems.map((i) => [i.name, i.resultDataUrl!]);
      await invoke("save_batch_to_folder", { items, folder });
    } catch (e) {
      showError(`Erreur lors de la sauvegarde : ${toMsg(e)}`);
    } finally {
      setIsSavingBatch(false);
    }
  }, [batchItems, showError]);

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
            <img src="/logo.png" alt="PureRemove" className="w-full h-full object-cover" />
          </div>
          <span className="text-foreground font-bold text-lg tracking-tight">PureRemove</span>
          <span className="text-muted-foreground text-xs bg-secondary px-2 py-0.5 rounded-full">v1.2</span>
        </div>

        <OutputOptions value={background} onChange={setBackground} disabled={single?.isProcessing} />
      </header>

      {/* ── Bandeau modèle manquant ── */}
      {modelError && (
        <div className="mx-4 mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex gap-3 items-start">
          <svg className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="text-sm text-destructive">
            <p className="font-semibold mb-0.5">Modèle IA introuvable</p>
            <p className="text-destructive/80">
              Placez <code className="bg-destructive/20 px-1 rounded">model.onnx</code> dans{" "}
              <code className="bg-destructive/20 px-1 rounded">src-tauri/resources/</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Toast erreur globale ── */}
      {globalError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-destructive text-white text-sm shadow-2xl max-w-md text-center">
          {globalError}
        </div>
      )}

      {/* ── Zone principale ── */}
      <main className="flex-1 min-h-0 p-4">
        {mode === "idle" && (
          <DropZone onPaths={handlePaths} onPaste={processClipboard} disabled={!!modelError} />
        )}
        {mode === "single" && single && (
          <SplitPreview
            originalSrc={single.sourceDataUrl}
            resultSrc={single.resultDataUrl || single.sourceDataUrl}
            onCopy={handleCopy}
            onSave={handleSaveSingle}
            onReset={handleReset}
            isProcessing={single.isProcessing}
          />
        )}
        {mode === "batch" && (
          <BatchList
            items={batchItems}
            onSaveAll={handleSaveAll}
            onSaveOne={handleSaveOne}
            onReset={handleReset}
            isSaving={isSavingBatch}
          />
        )}
      </main>
    </div>
  );
}
