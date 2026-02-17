/// commands.rs — Commandes Tauri exposées au frontend.
/// Toutes les commandes retournent Result<T, String> pour que les erreurs
/// arrivent comme des strings simples côté TypeScript (pas [object Object]).

use crate::{
    image_processor::{
        apply_mask, encode_base64_png, encode_png, load_image, load_image_from_bytes,
        save_png, BackgroundColor,
    },
    ml_engine,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// ─── Stockage de l'image clipboard originale (pour retraitement fond) ─────────

static CLIPBOARD_ORIGINAL: OnceCell<Mutex<Option<Vec<u8>>>> = OnceCell::new();

fn clipboard_store() -> &'static Mutex<Option<Vec<u8>>> {
    CLIPBOARD_ORIGINAL.get_or_init(|| Mutex::new(None))
}

// ─── Types partagés ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ProcessOptions {
    pub background: BackgroundColor,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchProgress {
    pub index: usize,
    pub total: usize,
    pub name: String,
    pub result_data_url: Option<String>,
    pub error: Option<String>,
}

// ─── Helper : init modèle ─────────────────────────────────────────────────────

fn ensure_model(app: &AppHandle) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Répertoire resources introuvable : {e}"))?;

    let model_path = resource_dir.join("model.onnx");

    ml_engine::init_model(&model_path).map_err(|e| e.to_string())
}

// ─── Commandes ────────────────────────────────────────────────────────────────

/// Traite UNE image depuis son chemin fichier.
/// Retourne un data URL base64 PNG.
#[tauri::command]
pub async fn process_single_image(
    app: AppHandle,
    path: String,
    options: ProcessOptions,
) -> Result<String, String> {
    ensure_model(&app)?;

    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("Fichier introuvable : {path}"));
    }

    let img = load_image(&file_path).map_err(|e| e.to_string())?;
    let mask = ml_engine::run_inference(&img).map_err(|e| e.to_string())?;
    let result = apply_mask(&img, &mask, &options.background);

    encode_base64_png(&result).map_err(|e| e.to_string())
}

/// Traite PLUSIEURS images en batch.
/// Émet l'événement `batch-progress` pour chaque image.
#[tauri::command]
pub async fn process_batch_images(
    app: AppHandle,
    paths: Vec<String>,
    options: ProcessOptions,
) -> Result<(), String> {
    ensure_model(&app)?;

    let total = paths.len();
    for (index, path_str) in paths.iter().enumerate() {
        let file_path = PathBuf::from(path_str);
        let name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("inconnu")
            .to_string();

        let progress = match process_one_file(&file_path, &options) {
            Ok(data_url) => BatchProgress {
                index,
                total,
                name,
                result_data_url: Some(data_url),
                error: None,
            },
            Err(e) => BatchProgress {
                index,
                total,
                name,
                result_data_url: None,
                error: Some(e.to_string()),
            },
        };

        let _ = app.emit("batch-progress", &progress);
    }

    Ok(())
}

fn process_one_file(path: &Path, options: &ProcessOptions) -> anyhow::Result<String> {
    let img = load_image(path)?;
    let mask = ml_engine::run_inference(&img)?;
    let result = apply_mask(&img, &mask, &options.background);
    encode_base64_png(&result).map_err(Into::into)
}

/// Lit l'image depuis le presse-papier et la traite.
#[tauri::command]
pub async fn process_clipboard_image(
    app: AppHandle,
    options: ProcessOptions,
) -> Result<String, String> {
    ensure_model(&app)?;

    let bytes = tokio::task::spawn_blocking(|| -> Result<Vec<u8>, String> {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| format!("Clipboard init : {e}"))?;

        let img_data = clipboard
            .get_image()
            .map_err(|e| format!("Pas d'image dans le presse-papier : {e}"))?;

        let rgba = image::RgbaImage::from_raw(
            img_data.width as u32,
            img_data.height as u32,
            img_data.bytes.into_owned(),
        )
        .ok_or_else(|| "Buffer clipboard invalide".to_string())?;

        let dyn_img = image::DynamicImage::ImageRgba8(rgba);
        encode_png(&dyn_img).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Mémorise les bytes originaux pour retraitement si le fond change
    {
        let mut store = clipboard_store().lock().unwrap_or_else(|e| e.into_inner());
        *store = Some(bytes.clone());
    }

    let img = load_image_from_bytes(&bytes).map_err(|e| e.to_string())?;
    let mask = ml_engine::run_inference(&img).map_err(|e| e.to_string())?;
    let result = apply_mask(&img, &mask, &options.background);

    encode_base64_png(&result).map_err(|e| e.to_string())
}

/// Retraite l'image clipboard mémorisée avec un nouveau fond (sans relire le presse-papier).
#[tauri::command]
pub async fn reprocess_clipboard_image(
    app: AppHandle,
    options: ProcessOptions,
) -> Result<String, String> {
    ensure_model(&app)?;

    let bytes = {
        let store = clipboard_store().lock().unwrap_or_else(|e| e.into_inner());
        store.clone().ok_or_else(|| "Aucune image clipboard mémorisée".to_string())?
    };

    let img = load_image_from_bytes(&bytes).map_err(|e| e.to_string())?;
    let mask = ml_engine::run_inference(&img).map_err(|e| e.to_string())?;
    let result = apply_mask(&img, &mask, &options.background);

    encode_base64_png(&result).map_err(|e| e.to_string())
}

/// Copie un résultat PNG (base64 data URL) dans le presse-papier.
#[tauri::command]
pub async fn copy_result_to_clipboard(data_url: String) -> Result<(), String> {
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&data_url);

    let png_bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;

    let img = image::load_from_memory(&png_bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| format!("Clipboard init : {e}"))?;

        let img_data = arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: std::borrow::Cow::Owned(rgba.into_raw()),
        };
        clipboard.set_image(img_data).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sauvegarde un résultat PNG (base64 data URL) vers un fichier.
#[tauri::command]
pub async fn save_result_to_file(data_url: String, dest_path: String) -> Result<(), String> {
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(&data_url);

    let png_bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;

    let img = image::load_from_memory(&png_bytes).map_err(|e| e.to_string())?;

    save_png(&img, Path::new(&dest_path)).map_err(|e| e.to_string())
}

/// Sauvegarde plusieurs résultats dans un dossier.
#[tauri::command]
pub async fn save_batch_to_folder(
    items: Vec<(String, String)>, // (nom_fichier, data_url)
    folder: String,
) -> Result<(), String> {
    let folder_path = PathBuf::from(&folder);
    std::fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

    for (name, data_url) in items {
        let stem = PathBuf::from(&name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("output")
            .to_string();

        let dest = folder_path.join(format!("{stem}_nobg.png"));
        save_result_to_file(data_url, dest.to_string_lossy().to_string()).await?;
    }

    Ok(())
}

/// Vérifie que le modèle est présent.
#[tauri::command]
pub async fn check_model(app: AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let model_path = resource_dir.join("model.onnx");
    if model_path.exists() {
        Ok(model_path.to_string_lossy().to_string())
    } else {
        Err("Modèle RMBG-1.4 introuvable. Placez model.onnx dans resources/".to_string())
    }
}
