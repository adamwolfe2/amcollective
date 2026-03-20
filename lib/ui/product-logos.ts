/**
 * Logo paths for portfolio products.
 * Used across dashboard, products page, and any product card component.
 */
const productLogos: Record<string, string> = {
  taskspace: "/logos/taskspace.png",
  trackr: "/logos/trackr.jpg",
  wholesail: "/logos/wholesail.png",
  tbgc: "/logos/tbgc.svg",
  cursive: "/logos/cursive.png",
  hook: "/logos/hook.png",
  myvsl: "/logos/myvsl.png",
};

/**
 * Get logo path for a product by slug or tag.
 * Falls back to null if no logo found.
 */
export function getProductLogo(key: string): string | null {
  const normalized = key.toLowerCase().replace(/\s+/g, "");
  return productLogos[normalized] ?? null;
}
