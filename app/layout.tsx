import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Messenger",
  description: "Chat 1:1, kenh thong bao va nhom realtime deploy tren Vercel"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
