import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The phone apps load the hosted Clover web app rather than bundling a copy: one deployment,
 * every device, and the app updates the moment `main` deploys. Set CLOVER_APP_URL to your hosted
 * address when syncing (`CLOVER_APP_URL=https://app.example.com pnpm sync`).
 */
const appUrl = process.env.CLOVER_APP_URL ?? "https://app.clover.example";

const config: CapacitorConfig = {
  appId: "app.clover.mobile",
  appName: "Clover",
  webDir: "www",
  server: {
    url: appUrl,
    cleartext: false,
    // Marketplace sign-in pages must open inside the app so the OAuth return lands back in it.
    allowNavigation: ["*.ebay.com", "*.nextdoor.com"],
  },
  ios: {
    contentInset: "automatic",
    scheme: "Clover",
    backgroundColor: "#f8f7f3",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#f8f7f3",
  },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 800, backgroundColor: "#f8f7f3", showSpinner: false },
    StatusBar: { style: "DEFAULT", overlaysWebView: true },
  },
};

export default config;
