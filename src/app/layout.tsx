import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitness App",
  description: "A comprehensive fitness tracking application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
