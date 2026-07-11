#[tauri::command]
fn normalize_document(text: String) -> String { text.replace("\r\n", "\n").replace('\r', "\n") }

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![normalize_document])
    .run(tauri::generate_context!())
    .expect("error while running mdTool");
}
