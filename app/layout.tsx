import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "OLD SCHOOL • Coffee & Good Days",
  description:
    "กาแฟแก้วโปรด กับวันดี ๆ ที่ OLD SCHOOL สั่งเครื่องดื่มที่โต๊ะได้เลย",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/assets/logo.png", apple: "/assets/icon-192.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
