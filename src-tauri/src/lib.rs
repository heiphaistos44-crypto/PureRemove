pub mod commands;
pub mod image_processor;
pub mod ml_engine;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/icon.ico"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_single_image,
            process_batch_images,
            process_clipboard_image,
            reprocess_clipboard_image,
            copy_result_to_clipboard,
            save_result_to_file,
            save_batch_to_folder,
            check_model,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur critique au lancement de Tauri");
}
