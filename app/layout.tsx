import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.majority.asia"),
  title: "Majority — What does the world think?",
  description: "Vote on binary questions. See how the world answered, by age and gender.",
  openGraph: {
    title: "Majority — What does the world think?",
    description: "Vote on binary questions. See how the world answered, by age and gender.",
    url: "https://www.majority.asia",
    siteName: "Majority",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Majority — What does the world think?",
    description: "Vote on binary questions. See how the world answered, by age and gender.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50">{children}</body>
    </html>
  );
}
