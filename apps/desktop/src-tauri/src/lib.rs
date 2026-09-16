//! Clover desktop shell. A single window that loads the hosted web app, so the desktop app is
//! always the same version as the site and needs no separate release for feature work.
//!
//! The address is fixed at build time through the `CLOVER_APP_URL` environment variable
//! (see the release workflow). Links to other sites open in the system browser, except the
//! marketplace sign-in pages, which must stay in-window so the OAuth return lands in the app.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

const DEFAULT_APP_URL: &str = "https://app.clover.example";

/// Hosts that may be navigated to inside the app window.
const IN_WINDOW_HOSTS: &[&str] = &["ebay.com", "nextdoor.com"];

fn app_url() -> Url {
    let raw = option_env!("CLOVER_APP_URL").unwrap_or(DEFAULT_APP_URL);
    Url::parse(raw).expect("CLOVER_APP_URL must be an absolute URL")
}

fn host_matches(host: &str, allowed: &str) -> bool {
    host == allowed || host.ends_with(&format!(".{allowed}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_url = app_url();
    let app_host = app_url.host_str().unwrap_or_default().to_string();

    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(move |app| {
            #[cfg(feature = "updater")]
            spawn_update_check(app.handle().clone());
            let handle = app.handle().clone();
            let home_host = app_host.clone();
            let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.clone()))
                .title("Clover")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0)
                .resizable(true)
                .on_navigation(move |url| {
                    let host = url.host_str().unwrap_or_default();
                    let allowed = host_matches(host, &home_host) || IN_WINDOW_HOSTS.iter().any(|h| host_matches(host, h));
                    if !allowed && matches!(url.scheme(), "http" | "https") {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    allowed
                })
                .on_download(|_webview, event| {
                    // Photo packs and data exports: save straight into the Downloads folder.
                    if let tauri::webview::DownloadEvent::Requested { url, destination } = event {
                        let name = url.path_segments().and_then(|mut s| s.next_back()).filter(|n| !n.is_empty()).unwrap_or("clover-download").to_string();
                        if let Some(dir) = dirs_download() {
                            *destination = dir.join(name);
                        }
                    }
                    true
                });
            #[cfg(target_os = "macos")]
            {
                builder = builder.title_bar_style(tauri::TitleBarStyle::Visible);
            }
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Clover");
}

/// Checks the release feed once at launch and, when a newer build exists, installs it and
/// restarts. Launch is the one moment a restart cannot interrupt anyone's work.
#[cfg(feature = "updater")]
fn spawn_update_check(handle: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = handle.updater() else { return };
        match updater.check().await {
            Ok(Some(update)) => {
                if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                    handle.restart();
                }
            }
            Ok(None) => {}
            Err(err) => eprintln!("[updater] check failed: {err}"),
        }
    });
}

fn dirs_download() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| std::path::PathBuf::from(h).join("Downloads"))
        .filter(|p| p.is_dir())
}
