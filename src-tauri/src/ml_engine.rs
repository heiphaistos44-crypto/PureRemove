/// ml_engine.rs — Inférence ONNX via RMBG-1.4 (ort 2.0.0-rc.11)
/// Input  : [1, 3, 1024, 1024] float32 normalisé (pixel/255 - 0.5)
/// Output : [1, 1, 1024, 1024] float32 sigmoid (0..1 = masque alpha)

use anyhow::{anyhow, Result};
use image::{imageops::FilterType, DynamicImage, GrayImage};
use once_cell::sync::OnceCell;
use ort::{inputs, session::Session, value::Tensor as OrtTensor};
use std::{path::Path, sync::Mutex};

const INPUT_SIZE: usize = 1024;

static SESSION: OnceCell<Mutex<Session>> = OnceCell::new();

/// Charge le modèle ONNX une seule fois (singleton). Idempotent.
pub fn init_model(model_path: &Path) -> Result<()> {
    if SESSION.get().is_some() {
        return Ok(());
    }

    if !model_path.exists() {
        return Err(anyhow!(
            "model.onnx introuvable à : {}. Téléchargez RMBG-1.4 depuis HuggingFace.",
            model_path.display()
        ));
    }

    let session = Session::builder()?.commit_from_file(model_path)?;

    SESSION
        .set(Mutex::new(session))
        .map_err(|_| anyhow!("Modèle déjà initialisé (race condition)"))?;

    Ok(())
}

/// Lance l'inférence et retourne le masque alpha (GrayImage taille originale).
pub fn run_inference(img: &DynamicImage) -> Result<GrayImage> {
    let session_mutex = SESSION
        .get()
        .ok_or_else(|| anyhow!("Modèle non initialisé — appelez init_model() d'abord"))?;

    // unwrap_or_else(|e| e.into_inner()) : récupère le lock même si un thread a paniqué
    let mut session = session_mutex
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let (orig_w, orig_h) = (img.width(), img.height());
    if orig_w == 0 || orig_h == 0 {
        return Err(anyhow!("Image invalide : dimensions 0×0"));
    }

    // ── Prétraitement ─────────────────────────────────────────────────────────
    let resized = img.resize_exact(INPUT_SIZE as u32, INPUT_SIZE as u32, FilterType::Lanczos3);
    let rgb = resized.to_rgb8();

    // Tenseur CHW [1, 3, H, W] : (pixel/255) - 0.5
    let plane = INPUT_SIZE * INPUT_SIZE;
    let mut data = vec![0.0f32; 3 * plane];

    for (x, y, pixel) in rgb.enumerate_pixels() {
        let idx = y as usize * INPUT_SIZE + x as usize;
        data[idx]             = pixel[0] as f32 / 255.0 - 0.5; // R
        data[plane + idx]     = pixel[1] as f32 / 255.0 - 0.5; // G
        data[2 * plane + idx] = pixel[2] as f32 / 255.0 - 0.5; // B
    }

    // ── Création du tenseur ort ────────────────────────────────────────────────
    // ort rc.11 : Tensor::from_array((shape, slice))
    let shape = [1usize, 3, INPUT_SIZE, INPUT_SIZE];
    let tensor = OrtTensor::from_array((shape, data))
        .map_err(|e| anyhow!("Création tenseur : {e}"))?;

    // ── Inférence ─────────────────────────────────────────────────────────────
    let outputs = session.run(inputs!["input" => tensor])?;

    // ── Post-traitement ───────────────────────────────────────────────────────
    // try_extract_tensor() retourne (Shape, &[T]) dans ort rc.11
    let (_, mask_data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| anyhow!("Extraction tenseur de sortie : {e}"))?;

    // Convertit le masque [1,1,H,W] float → GrayImage 1024×1024
    let raw_mask: Vec<u8> = mask_data
        .iter()
        .map(|&v: &f32| (v.clamp(0.0, 1.0) * 255.0) as u8)
        .collect();

    let mask_1024 = GrayImage::from_raw(INPUT_SIZE as u32, INPUT_SIZE as u32, raw_mask)
        .ok_or_else(|| anyhow!("Impossible de créer GrayImage depuis le masque"))?;

    // Redimensionne le masque à la résolution originale
    let mask_orig = image::imageops::resize(&mask_1024, orig_w, orig_h, FilterType::Lanczos3);

    Ok(mask_orig)
}
