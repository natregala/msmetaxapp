import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./simplified.css";
import { OfflineRegistration } from "@/features/transactions/components/offline-registration";
export const metadata: Metadata = {
  title: "Kitang-Kita · Business records",
  description:
    "Record and review your business transactions in English or Tagalog.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#176347",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <OfflineRegistration />
      </body>
    </html>
  );
}
