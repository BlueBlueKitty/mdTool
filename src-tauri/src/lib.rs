use tauri::webview::PageLoadEvent;

#[tauri::command]
fn normalize_document(text: String) -> String { text.replace("\r\n", "\n").replace('\r', "\n") }

#[tauri::command]
fn startup_paths() -> Vec<String> {
  std::env::args_os().skip(1).filter_map(|arg| {
    let path = std::path::PathBuf::from(arg);
    path.is_file().then(|| path.to_string_lossy().into_owned())
  }).collect()
}

#[tauri::command]
fn read_startup_file(path: String) -> Result<String, String> {
  if !startup_paths().iter().any(|item| item == &path) {
    return Err("启动文件路径未获授权".into());
  }
  std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
  app.exit(0);
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![normalize_document, startup_paths, read_startup_file, exit_app])
    .on_page_load(|webview, payload| {
      if matches!(payload.event(), PageLoadEvent::Finished) {
        let _ = webview.window().show();
        let _ = webview.window().set_focus();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running mdTool");
}
