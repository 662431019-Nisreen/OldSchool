import type { Metadata } from "next";
export const metadata: Metadata = {
  manifest: "/api/manifest?workspace=1",
  appleWebApp: {
    capable: true,
    title: "Old School ร้าน",
    statusBarStyle: "default",
  },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
