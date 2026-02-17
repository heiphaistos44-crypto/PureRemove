use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("Modèle non initialisé. Placez model.onnx dans le dossier resources/")]
    ModelNotInitialized,

    #[error("Erreur d'inférence : {0}")]
    Inference(String),

    #[error("Erreur de traitement d'image : {0}")]
    ImageProcessing(String),

    #[error("Format de fichier non supporté : {0}")]
    UnsupportedFormat(String),

    #[error("Erreur de presse-papier : {0}")]
    Clipboard(String),

    #[error("Fichier introuvable : {0}")]
    FileNotFound(String),

    #[error("Erreur d'encodage : {0}")]
    Encoding(String),

    #[error("Erreur I/O : {0}")]
    Io(String),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Inference(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

// Tauri exige que les erreurs de commandes soient sérialisables
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
