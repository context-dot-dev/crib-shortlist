import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f1ed",
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: "criblist · sf + nyc rentals",
  description:
    "criblist turns live san francisco and new york city listings into a clean deck you can swipe, save, and act on.",
  openGraph: {
    title: "criblist · sf + nyc rentals",
    description:
      "criblist turns live san francisco and new york city listings into a clean deck you can swipe, save, and act on.",
    siteName: "criblist",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "criblist · sf + nyc rentals",
    description:
      "criblist turns live san francisco and new york city listings into a clean deck you can swipe, save, and act on.",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png?v=sf1", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png?v=sf1", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=sf1",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://images.craigslist.org" />
        <link rel="dns-prefetch" href="https://images.craigslist.org" />
        <link rel="preconnect" href="https://images.cdn.appfolio.com" />
        <link rel="dns-prefetch" href="https://images.cdn.appfolio.com" />
        <link rel="preconnect" href="https://www.rentalsinsf.com" />
        <link rel="preconnect" href="https://nooklyn.com" />
      </head>
      <body>{children}</body>
      <Script
        src="https://cdn.databuddy.cc/databuddy.js"
        data-client-id="3d714673-4159-4933-b090-47f2b733ffa3"
        data-track-outgoing-links="true"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
    </html>
  );
}
