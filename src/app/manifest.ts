import type { MetadataRoute } from "next";

/** Web app manifest: lets phones and desktops install Clover from the browser as a home-screen app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clover",
    short_name: "Clover",
    description: "Photograph it. It's for sale. Clover identifies, prices, photographs and lists what you're selling.",
    id: "/",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f7f3",
    theme_color: "#1f7a4d",
    categories: ["shopping", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Scan an item", url: "/sell/capture", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Offers", url: "/offers", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
