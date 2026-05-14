import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fakesenger",
  description: "Ứng dụng nhắn tin Fakesenger"
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
