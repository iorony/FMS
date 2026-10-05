import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker usa el servidor autocontenido; Vercel gestiona internamente el trazado
  // de archivos y no admite esta salida durante su empaquetado final.
  output: process.env.VERCEL ? undefined : "standalone",
  images: { remotePatterns: [] },
};

export default nextConfig;
