import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Plus Service GT | FSM", description: "Gestión de órdenes de campo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
