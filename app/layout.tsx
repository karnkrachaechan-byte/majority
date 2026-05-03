import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Majority — What does the world think?",
  description: "Vote on binary questions and see what the majority thinks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
