/// image_processor.rs — Chargement, manipulation et encodage des images.

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, GrayImage, Luma, RgbaImage};
use std::io::Cursor;
use std::path::Path;

// ─── Formats supportés ────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "svg",
    "bmp", "gif", "tif", "tiff", "ico",
    "tga", "pnm", "pbm", "pgm", "ppm",
    "hdr", "ff", "qoi",
];

pub fn is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// ─── Chargement ──────────────────────────────────────────────────────────────

/// Charge une image depuis un chemin fichier.
/// SVG → rasterisé à 2048px de large minimum.
/// Images > 4K → Smart-resize avant envoi au moteur ML.
pub fn load_image(path: &Path) -> Result<DynamicImage> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "svg" {
        let data = std::fs::read(path)?;
        return rasterize_svg(&data);
    }

    let img = image::open(path).map_err(|e| anyhow!("Impossible d'ouvrir {} : {e}", path.display()))?;
    Ok(smart_downscale(img))
}

/// Charge depuis un buffer brut en mémoire (ex: clipboard, drag&drop données).
pub fn load_image_from_bytes(bytes: &[u8]) -> Result<DynamicImage> {
    let img = image::load_from_memory(bytes).map_err(|e| anyhow!("Décodage image : {e}"))?;
    Ok(smart_downscale(img))
}

/// Réduit intelligemment si > 4096px sur un côté (VRAM protection).
fn smart_downscale(img: DynamicImage) -> DynamicImage {
    const MAX_DIM: u32 = 4096;
    let (w, h) = (img.width(), img.height());
    if w <= MAX_DIM && h <= MAX_DIM {
        return img;
    }
    let scale = MAX_DIM as f32 / w.max(h) as f32;
    let nw = (w as f32 * scale) as u32;
    let nh = (h as f32 * scale) as u32;
    img.resize_exact(nw, nh, image::imageops::FilterType::Lanczos3)
}

// ─── SVG → Bitmap ────────────────────────────────────────────────────────────

fn rasterize_svg(svg_data: &[u8]) -> Result<DynamicImage> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(svg_data, &options)
        .map_err(|e| anyhow!("SVG parse error : {e}"))?;

    let size = tree.size();

    // Guard : SVG à dimensions nulles → panic division/zéro + DoS
    if size.width() <= 0.0 || size.height() <= 0.0 {
        return Err(anyhow!("SVG invalide : dimensions nulles ou négatives"));
    }

    const MIN_SVG_WIDTH: f32 = 2048.0;
    const MAX_SVG_PIXELS: u32 = 8192; // Cap anti-DoS (~256 MB max)
    let scale = (MIN_SVG_WIDTH / size.width()).max(1.0);

    let px_w = ((size.width() * scale) as u32).min(MAX_SVG_PIXELS);
    let px_h = ((size.height() * scale) as u32).min(MAX_SVG_PIXELS);

    let mut pixmap = resvg::tiny_skia::Pixmap::new(px_w, px_h)
        .ok_or_else(|| anyhow!("Impossible de créer le Pixmap SVG ({px_w}×{px_h})"))?;

    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    // tiny_skia Pixmap est en RGBA prémultiplié — on dé-multiplie pour image crate
    let rgba_data: Vec<u8> = pixmap
        .data()
        .chunks(4)
        .flat_map(|px| {
            let a = px[3] as f32 / 255.0;
            if a > 0.0 {
                [
                    (px[0] as f32 / a) as u8,
                    (px[1] as f32 / a) as u8,
                    (px[2] as f32 / a) as u8,
                    px[3],
                ]
            } else {
                [0, 0, 0, 0]
            }
        })
        .collect();

    let rgba_img = RgbaImage::from_raw(px_w, px_h, rgba_data)
        .ok_or_else(|| anyhow!("Conversion SVG→RgbaImage échouée"))?;

    Ok(smart_downscale(DynamicImage::ImageRgba8(rgba_img)))
}

// ─── Application du masque alpha ─────────────────────────────────────────────

/// Couleur de fond pour la sortie.
/// `#[serde(tag = "type")]` correspond au format TypeScript `{ type: "Transparent" }` etc.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum BackgroundColor {
    Transparent,
    White,
    Black,
    Color { r: u8, g: u8, b: u8 },
}

/// Applique le masque alpha (avec flou de bords) sur l'image originale.
/// Retourne une RgbaImage avec le fond choisi.
pub fn apply_mask(
    img: &DynamicImage,
    mask: &GrayImage,
    bg: &BackgroundColor,
) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let rgba_src = img.to_rgba8();

    // Flou 1px sur le masque pour éviter l'effet "coupé au ciseau"
    let blurred_mask = blur_mask(mask);

    let mut output = RgbaImage::new(w, h);

    for y in 0..h {
        for x in 0..w {
            let src = rgba_src.get_pixel(x, y);
            let alpha = blurred_mask.get_pixel(x, y)[0];
            let alpha_f = alpha as f32 / 255.0;

            let out = match bg {
                BackgroundColor::Transparent => {
                    [src[0], src[1], src[2], alpha]
                }
                BackgroundColor::White => {
                    let blend = |fg: u8, bg_c: u8| -> u8 {
                        (fg as f32 * alpha_f + bg_c as f32 * (1.0 - alpha_f)) as u8
                    };
                    [blend(src[0], 255), blend(src[1], 255), blend(src[2], 255), 255]
                }
                BackgroundColor::Black => {
                    let blend = |fg: u8| -> u8 { (fg as f32 * alpha_f) as u8 };
                    [blend(src[0]), blend(src[1]), blend(src[2]), 255]
                }
                BackgroundColor::Color { r, g, b } => {
                    let blend = |fg: u8, bg_c: u8| -> u8 {
                        (fg as f32 * alpha_f + bg_c as f32 * (1.0 - alpha_f)) as u8
                    };
                    [blend(src[0], *r), blend(src[1], *g), blend(src[2], *b), 255]
                }
            };
            output.put_pixel(x, y, image::Rgba(out));
        }
    }

    DynamicImage::ImageRgba8(output)
}

/// Gaussian blur 3×3 léger sur le masque pour adoucir les contours.
fn blur_mask(mask: &GrayImage) -> GrayImage {
    let (w, h) = mask.dimensions();
    let kernel: [f32; 9] = [
        1.0 / 16.0, 2.0 / 16.0, 1.0 / 16.0,
        2.0 / 16.0, 4.0 / 16.0, 2.0 / 16.0,
        1.0 / 16.0, 2.0 / 16.0, 1.0 / 16.0,
    ];
    let mut out = GrayImage::new(w, h);

    for y in 0..h {
        for x in 0..w {
            let mut sum = 0.0f32;
            for ky in 0..3i32 {
                for kx in 0..3i32 {
                    let px = (x as i32 + kx - 1).clamp(0, w as i32 - 1) as u32;
                    let py = (y as i32 + ky - 1).clamp(0, h as i32 - 1) as u32;
                    sum += mask.get_pixel(px, py)[0] as f32
                        * kernel[(ky * 3 + kx) as usize];
                }
            }
            out.put_pixel(x, y, Luma([sum as u8]));
        }
    }
    out
}

// ─── Encodage ────────────────────────────────────────────────────────────────

/// Encode une DynamicImage en PNG dans un Vec<u8>.
pub fn encode_png(img: &DynamicImage) -> Result<Vec<u8>> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| anyhow!("Encodage PNG : {e}"))?;
    Ok(buf.into_inner())
}

/// Encode en PNG puis encode en base64 (pour transfert frontend ↔ backend).
pub fn encode_base64_png(img: &DynamicImage) -> Result<String> {
    let png_bytes = encode_png(img)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(&png_bytes)))
}

/// Sauvegarde une DynamicImage en PNG sur le disque.
pub fn save_png(img: &DynamicImage, dest: &Path) -> Result<()> {
    img.save_with_format(dest, image::ImageFormat::Png)
        .map_err(|e| anyhow!("Sauvegarde PNG vers {} : {e}", dest.display()))
}
