import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SentenceCaseInputs } from "@/components/sentence-case-inputs";

export const metadata: Metadata = {
  title: { default: "Plus Service · Gestión de campo", template: "%s · Plus Service" },
  description: "Gestión trazable de órdenes de instalación en campo: planificación, ejecución, evidencias y cierre formal.",
};

export const viewport: Viewport = {
  themeColor: "#343534",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-GT">
      <body><SentenceCaseInputs />{children}</body>
    </html>
  );
}
