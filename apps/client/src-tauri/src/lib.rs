use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Кассовый терминал: F5/Ctrl+R/Ctrl+Shift+R/F12 и т.п. — это "браузерные" акселераторы
// WebView2, они обрабатываются самим движком до того, как долетают до JS на странице,
// поэтому preventDefault() в клиенте их не останавливает (см. apps/client/src/lib/kiosk-guards.ts,
// который блокирует то же самое на уровне DOM для второго слоя защиты). Отключаем их здесь,
// на уровне нативных настроек WebView2 — иначе Ctrl+Shift+R перезагружает окно и сбрасывает
// открытый чек кассира.
#[cfg(target_os = "windows")]
fn disable_webview_accelerators(window: &tauri::WebviewWindow) {
    use tauri::webview::Webview;
    use webview2_com_sys::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let webview: &Webview = window.as_ref();
    let _ = webview.with_webview(|platform_webview| {
        let controller = platform_webview.controller();
        unsafe {
            if let Ok(core) = controller.CoreWebView2() {
                if let Ok(settings) = core.Settings() {
                    // AreDefaultContextMenusEnabled / AreDevToolsEnabled — базовый интерфейс.
                    let _ = settings.SetAreDefaultContextMenusEnabled(false);
                    let _ = settings.SetAreDevToolsEnabled(false);

                    // AreBrowserAcceleratorKeysEnabled (F5/Ctrl+R/Ctrl+Shift+R/F12/...) —
                    // появился в ICoreWebView2Settings3, нужен QueryInterface (cast).
                    if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                        let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
                    }
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                disable_webview_accelerators(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
