import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitSync",
  description: "ติดตามการออกกำลังกาย โภชนาการ และรับคำแนะนำจาก AI Coach",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
