import Image from "next/image";

export function BrandLogo() {
  // Ícono recortado del isotipo (sin el logotipo "Plusservice"): a 38-56px el
  // lockup completo se veía diminuto e ilegible dentro de una insignia circular.
  return <Image className="brand-mark" src="/plusservice-mark.png" alt="Plus Service" width={56} height={56} priority />;
}
