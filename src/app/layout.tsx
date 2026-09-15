import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { headers } from "next/headers";
import { Providers } from "@/components/shell/providers";

export const metadata: Metadata = {
  title: { default: "Clover", template: "%s · Clover" },
  description: "Photograph it. It's for sale. Clover turns a photo into a priced, written, photographed listing on every marketplace you use.",
  applicationName: "Clover",
  icons: { icon: "/brand/clover-mark.svg" },
  appleWebApp: { capable: true, title: "Clover", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F7F3" },
    { media: "(prefers-color-scheme: dark)", color: "#141613" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `(function(){try{var t=localStorage.getItem('clover:theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme',window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only-focusable fixed left-4 top-4 z-[100] rounded-xs bg-surface-overlay px-3 py-2 text-sm shadow-float">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
