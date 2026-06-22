import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./_components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitSync",
  description: "ติดตามการออกกำลังกาย โภชนาการ และรับคำแนะนำจาก AI Coach",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
