import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { AssistantFab } from "@/components/shell/AssistantFab";
import { AppProviders } from "./providers";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MSB Financial Copilot",
  description: "Trợ lý quản lý tài chính cá nhân MSB",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f26522",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        <PhoneShell nav={<BottomNav />} fab={<AssistantFab />}>
          <AppProviders>{children}</AppProviders>
        </PhoneShell>
      </body>
    </html>
  );
}
