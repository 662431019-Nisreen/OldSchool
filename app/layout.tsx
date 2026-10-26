import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  referrer: "no-referrer",
  title: "OLD SCHOOL • Coffee & Good Days",
  description:
    "กาแฟแก้วโปรด กับวันดี ๆ ที่ OLD SCHOOL สั่งเครื่องดื่มที่โต๊ะได้เลย",
  appleWebApp: {
    capable: true,
    title: "Old School Coffee",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/assets/logo.png", apple: "/assets/icon-192.png" },
};
export const viewport: Viewport = {
  themeColor: "#64421e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
