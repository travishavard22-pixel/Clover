# Desktop, iOS and Android apps

Clover ships as one hosted web app plus thin native shells. The shells load the hosted address in a
native window, so every device runs the same version, updates arrive the moment `main` deploys, and
secrets stay on the server. What the shells add is what a web page cannot: an icon in the dock or
on the home screen, the native camera, the share sheet for the assisted marketplaces, and, later,
push notifications for offers.

Prerequisite: the hosted app from `hosted-setup.md`, at a stable `https://` address. Put that
address in the GitHub repository variable `CLOVER_APP_URL` (Settings → Secrets and variables →
Actions → Variables). Every build below reads it.

## Quickest path: install from the browser

Open the hosted address in Safari on iPhone or Chrome on Android and choose **Add to Home Screen**.
On desktop Chrome or Edge, use **Install Clover** in the address bar. This uses the web manifest
already in the app and needs no build at all. It is the right way to try things today; the native
shells below are for store distribution and the extra platform features.

## Desktop (macOS, Windows, Linux) — Tauri

Project: `apps/desktop`. A single window that loads `CLOVER_APP_URL`; external links open in the
system browser; downloads (photo packs, exports) land in the Downloads folder.

**Build installers in GitHub Actions.** Push a tag such as `desktop-v0.1.0`, or run the "Desktop
release" workflow from the Actions tab. It produces a draft GitHub release with `.dmg` (Apple
Silicon and Intel), `.msi` and `.exe` (Windows), and `.AppImage` / `.deb` (Linux). Publish the
draft to share the installers.

**Signing.** Unsigned builds run, but macOS shows a warning and Windows SmartScreen prompts. To
sign:

- macOS: join the Apple Developer Program (US$99/year), create a *Developer ID Application*
  certificate, export it as `.p12`, and add the secrets listed at the top of
  `.github/workflows/release-desktop.yml`. Notarisation happens automatically when `APPLE_ID`,
  `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID` are present.
- Windows: buy a code-signing certificate (an OV certificate is enough), export as `.pfx`, base64
  it into `WINDOWS_CERTIFICATE` with its password in `WINDOWS_CERTIFICATE_PASSWORD`.

**Build locally** (optional): install Rust from rustup.rs, then in `apps/desktop` run
`pnpm install` and `CLOVER_APP_URL=https://app.example.com pnpm build`. Linux needs
`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` and `patchelf`.

**Auto-update.** The app checks the latest GitHub release at launch and installs a newer build
before showing the window. It is switched on by an updater key pair:

1. On your computer: `cd apps/desktop && pnpm install && pnpm tauri signer generate -w ~/.tauri/clover.key`
   (choose a password). Keep `~/.tauri/clover.key` safe; it cannot be recreated and every
   future update must be signed with it.
2. Repository **variable** `TAURI_UPDATER_PUBKEY`: the contents of `~/.tauri/clover.key.pub`.
3. Repository **secrets** `TAURI_SIGNING_PRIVATE_KEY` (contents of `clover.key`) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Publish releases (not drafts): the workflow adds a signed `latest.json` that installed apps
   read. Bump `version` in `apps/desktop/src-tauri/tauri.conf.json` and
   `apps/desktop/src-tauri/Cargo.toml` for each release; the app only updates to a higher version.

## iOS and Android — Capacitor

Project: `apps/mobile`. `capacitor.config.ts` points the app at `CLOVER_APP_URL` and allows the
eBay and Nextdoor sign-in pages to open inside the app so OAuth returns to it. The Android project
is committed; the iOS project is generated on a Mac (`pnpm add:ios`) or by the workflow.

**Android.** The "Mobile builds" workflow produces a debug APK as an artifact on every change to
`apps/mobile` and on demand. Install it on a phone to try the app. For Google Play:

1. Create a Google Play Console account (one-time US$25).
2. Create an upload keystore (`keytool -genkey -v -keystore clover-upload.keystore -alias clover
   -keyalg RSA -keysize 2048 -validity 10000`) and keep it somewhere safe; it cannot be recreated.
3. Build a release bundle locally in Android Studio (`pnpm open:android` → Build → Generate Signed
   Bundle) with that keystore, and upload the `.aab` to a closed testing track first.

**iOS.** Building for a device or the App Store needs a Mac with Xcode and an Apple Developer
Program membership:

1. `cd apps/mobile && pnpm install && pnpm add:ios && pnpm sync`.
2. `pnpm open:ios`, select your team under *Signing & Capabilities*, and run on your phone.
3. For TestFlight and the App Store, archive from Xcode and upload with the Organizer.

**Push notifications for offers.** The phone apps register for notifications the first time the
seller allows them, and every in-app notification (new offer, listing needs attention, item ready,
sale recorded) is pushed to the registered devices. Delivery needs credentials on the server:

- Android: create a Firebase project at console.firebase.google.com, add an Android app with the
  package name `app.clover.mobile`, download `google-services.json`, and store it base64-encoded
  in the repository secret `GOOGLE_SERVICES_JSON` (the Android workflow writes it into the
  project; it is deliberately not committed). Then Project settings → Service accounts → Generate
  new private key, and put that JSON in the server variable `FCM_SERVICE_ACCOUNT_JSON`.
- iOS: in the Apple Developer account create a Key with *Apple Push Notifications service*
  enabled, download the `.p8` once, and set `APNS_KEY_ID`, `APNS_TEAM_ID` and
  `APNS_PRIVATE_KEY` (the file contents) on the server. In Xcode add the *Push Notifications*
  capability to the app target. Use `APNS_ENV=sandbox` for builds run from Xcode and
  `production` for TestFlight and the App Store.

Registered devices are listed under Settings → Sessions, where any of them can be removed.

**Store review notes.** Both stores accept apps built this way when the app is clearly more than a
website in a frame. Clover's native camera capture, share-sheet posting flows and home-screen
presence cover that; adding push notifications for offers (Capacitor's push plugin plus a small
server change) strengthens it further and is the natural next feature.

**Changing the address.** Rebuild after changing `CLOVER_APP_URL`; the shells bake it in. Keep the
production address stable, and use a separate `app.staging.<domain>` deployment for testing.

## What is shared and what is not

| Concern | Where it lives |
|---|---|
| Every screen, flow and API | The hosted web app; nothing is duplicated in the shells |
| Sign-in and sessions | Same cookies as the browser; no extra auth code |
| Camera | The web capture screen in the app; the shells grant the permission |
| Share sheet | `src/lib/native/shell.ts` uses the web share API, or the Capacitor plugin on Android |
| eBay / Nextdoor OAuth | In-window navigation allowed for those hosts, so the return lands in the app |
| Downloads | Browser default on the web; Downloads folder on desktop; share sheet on phones |
