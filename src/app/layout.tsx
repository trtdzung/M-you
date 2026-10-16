import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "MSB Financial Copilot",
  description: "Trợ lý quản lý tài chính cá nhân MSB",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#d81f36",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <PhoneShell nav={<BottomNav />}>
          <AppProviders>{children}</AppProviders>
        </PhoneShell>
      </body>
    </html>
  );
}
