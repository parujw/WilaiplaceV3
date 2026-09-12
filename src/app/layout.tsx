import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const thai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wilai Communities",
  description: "ระบบจัดการหอพักในเครือวิไล — ค่าเช่า มิเตอร์ บิล และผู้เช่า",
  applicationName: "Wilai Communities",
};

export const viewport: Viewport = {
  themeColor: "#eeebe6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
