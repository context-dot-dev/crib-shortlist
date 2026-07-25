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
      {/* Privacy-friendly analytics by Plausible */}
      <Script
        src="https://plausible.io/js/pa-LK9zQ2IcDbCYo1aOsBGBt.js"
        strategy="afterInteractive"
      />
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
        plausible.init()`}
      </Script>
    </html>
  );
}
