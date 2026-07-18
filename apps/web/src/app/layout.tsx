import type { Metadata } from "next";
import { Suspense } from "react";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import "./globals.css";

export const metadata: Metadata = {
  title: "CabinetFlow AI — Cabinet Design Platform",
  description:
    "AI-powered parametric cabinet design. Change one dimension, every part updates automatically.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
