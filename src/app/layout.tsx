import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono, Noto_Sans_Devanagari, Kalam } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { PROFILE } from "@/content/profile";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const martian = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

const deva = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-noto-deva",
  display: "swap",
});

// Surveyor's field notes in the margins: an Indian handwriting face.
const kalam = Kalam({
  subsets: ["latin", "devanagari"],
  weight: ["400"],
  variable: "--font-kalam",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${PROFILE.name} · AI Engineer`,
    template: `%s · ${PROFILE.name}`,
  },
  description:
    "Lakshya Jain is an AI engineer building production agentic systems — human-in-the-loop LLM platforms, RAG pipelines and on-device models — with roots in robotics and XR.",
  applicationName: "Lakshya Jain — survey sheet",
  authors: [{ name: PROFILE.name, url: PROFILE.github }],
  keywords: ["Lakshya Jain", "AI Engineer", "LLM", "RAG", "LangGraph", "Agentic AI", "Delhi", "portfolio"],
  openGraph: {
    type: "website",
    title: `${PROFILE.name} · AI Engineer`,
    description: "A night survey of an AI engineer's terrain: agents, retrieval, edge ML, robotics and XR.",
    siteName: PROFILE.name,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: `${PROFILE.name} · AI Engineer` },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b100d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

// Runs before paint: repeat visitors this session skip the greeting without a flash.
const bootScript = `try{var q=location.search;if(/[?&]skipintro\\b/.test(q)||(sessionStorage.getItem("lj-greeted")==="1"&&!/[?&]intro\\b/.test(q)))document.documentElement.dataset.greeted="1"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${martian.variable} ${deva.variable} ${kalam.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <noscript>
          <style>{`[data-greeting]{display:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to the sheet
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
