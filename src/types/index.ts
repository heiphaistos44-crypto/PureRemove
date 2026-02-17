export type BackgroundColor =
  | { type: "Transparent" }
  | { type: "White" }
  | { type: "Black" }
  | { type: "Color"; r: number; g: number; b: number };

// Formats acceptés (extensions + MIME)
export const ACCEPTED_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "svg",
  "bmp", "gif", "tif", "tiff", "ico",
  "tga", "pnm", "pbm", "pgm", "ppm",
  "hdr", "ff", "qoi",
] as const;

export const ACCEPTED_MIME_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/svg+xml",
  "image/bmp", "image/gif", "image/tiff",
  "image/x-icon", "image/vnd.microsoft.icon",
  "image/x-tga", "image/x-targa",
  "image/x-portable-anymap", "image/x-portable-bitmap",
  "image/x-portable-graymap", "image/x-portable-pixmap",
  "image/vnd.radiance",   // HDR
  "image/avif",           // bonus si dispo
] as const;

export interface ProcessOptions {
  background: BackgroundColor;
}

export type ItemStatus = "pending" | "processing" | "done" | "error";

export interface ImageItem {
  id: string;
  name: string;
  /** Chemin fichier (disk) ou data URL (clipboard) */
  sourcePath?: string;
  sourceDataUrl?: string;
  status: ItemStatus;
  resultDataUrl?: string;
  error?: string;
}

export type AppMode = "idle" | "single" | "batch";

export interface BatchProgressEvent {
  index: number;
  total: number;
  name: string;
  result_data_url?: string;
  error?: string;
}
