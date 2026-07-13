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

#[tauri::command]
fn current_platform() -> &'static str {
  if cfg!(target_os = "windows") { "windows" }
  else if cfg!(target_os = "macos") { "macos" }
  else if cfg!(target_os = "linux") { "linux" }
  else { "unknown" }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let parsed = url::Url::parse(&url).map_err(|_| "链接格式无效")?;
  let host = parsed.host_str().unwrap_or_default();
  if parsed.scheme() != "https" || ![
    "github.com", "www.github.com", "raw.githubusercontent.com",
    "objects.githubusercontent.com", "github-releases.githubusercontent.com",
  ].contains(&host) {
    return Err("仅允许打开 mdTool 的 GitHub HTTPS 链接".into());
  }
  #[cfg(target_os = "windows")]
  std::process::Command::new("rundll32.exe")
    .args(["url.dll,FileProtocolHandler", &url])
    .spawn()
    .map_err(|error| error.to_string())?;
  #[cfg(target_os = "macos")]
  std::process::Command::new("open").arg(&url).spawn().map_err(|error| error.to_string())?;
  #[cfg(target_os = "linux")]
  std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|error| error.to_string())?;
  Ok(())
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![normalize_document, startup_paths, read_startup_file, exit_app, current_platform, open_external_url])
    .on_page_load(|webview, payload| {
      if matches!(payload.event(), PageLoadEvent::Finished) {
        let _ = webview.window().show();
        let _ = webview.window().set_focus();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running mdTool");
}
