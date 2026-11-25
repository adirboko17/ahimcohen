export type Brand = { id: string; name: string; logo?: string; featured?: boolean };

export const BRANDS: Brand[] = [
  { id: "carhartt", name: "Carhartt", logo: "/images/brands/carhartt.svg", featured: true },
  { id: "redback", name: "Redback", logo: "/images/brands/redback.webp", featured: true },
  { id: "worker", name: "WORKER", logo: "/images/brands/worker.svg", featured: true },
  { id: "steel-blue", name: "Steel Blue", logo: "/images/brands/steel-blue.webp", featured: true },
  { id: "showa", name: "SHOWA", logo: "/images/brands/showa.webp", featured: true },
  { id: "jsp", name: "JSP", logo: "/images/brands/jsp.webp", featured: true },
  { id: "wecamp", name: "WECAMP", logo: "/images/brands/wecamp.webp", featured: true },
  { id: "ego-chef", name: "Ego Chef", logo: "/images/brands/ego-chef.webp", featured: true },
  { id: "bicap", name: "BICAP", logo: "/images/brands/bicap.webp", featured: true },
  { id: "kratos", name: "KRATOS", logo: "/images/brands/kratos.svg", featured: true },
  { id: "albatros", name: "ALBATROS", logo: "/images/brands/albatros.webp", featured: true },
  { id: "birkenstock", name: "Birkenstock", logo: "/images/brands/birkenstock.svg", featured: true },
  { id: "jeep", name: "Jeep", logo: "/images/brands/jeep.webp" },
  { id: "neri", name: "Neri", logo: "/images/brands/neri.webp" },
  { id: "medop", name: "MEDOP", logo: "/images/brands/medop.webp" },
  { id: "kayo", name: "KAYO", logo: "/images/brands/kayo.webp" },
  { id: "tiger-grip", name: "TIGER GRIP", logo: "/images/brands/tiger-grip.webp" },
  { id: "australian", name: "AUSTRALIAN", logo: "/images/brands/australian.webp" },
  { id: "smartfeet", name: "SMARTFEET" },
  { id: "trackstone", name: "TRACKSTONE", logo: "/images/brands/trackstone.webp" },
  { id: "gaoma", name: "GAOMA", logo: "/images/brands/gaoma.webp" },
  { id: "delta-plus", name: "DELTA PLUS", logo: "/images/brands/delta-plus.webp" },
  { id: "spasciani", name: "SPASCIANI", logo: "/images/brands/spasciani.webp" },
  { id: "alexandra", name: "ALEXANDRA", logo: "/images/brands/alexandra.webp" },
  { id: "tarway", name: "TARWAY", logo: "/images/brands/tarway.webp" },
  { id: "top-glove", name: "TOP GLOVE", logo: "/images/brands/top-glove.webp" },
  { id: "portwest", name: "PORTWEST", logo: "/images/brands/portwest.webp" },
  { id: "toffeln", name: "TOFFELN", logo: "/images/brands/toffeln.webp" },
  { id: "dian", name: "DIAN", logo: "/images/brands/dian.webp" },
  { id: "alba", name: "ALBA" },
  { id: "allen-cooper", name: "ALLEN COOPER", logo: "/images/brands/allen-cooper.webp" },
  { id: "outback", name: "OUTBACK" },
  { id: "mure-peyrot", name: "MURE PEYROT", logo: "/images/brands/mure-peyrot.webp" },
  { id: "majestic", name: "MAJESTIC", logo: "/images/brands/majestic.webp" },
  { id: "fortune-hong-kong", name: "FORTUNE HONG KONG" },
  { id: "koudx", name: "KOUDX" },
  { id: "wypall", name: "WYPALL", logo: "/images/brands/wypall.webp" },
  { id: "workpro", name: "WORKPRO", logo: "/images/brands/workpro.webp" },
  { id: "everbrite", name: "EverBrite", logo: "/images/brands/everbrite.webp" },
  { id: "arad", name: "ערד", logo: "/images/brands/arad.webp" },
  { id: "justrite", name: "Justrite", logo: "/images/brands/justrite.webp" },
  { id: "rayovac", name: "RAYOVAC", logo: "/images/brands/rayovac.webp" },
  { id: "regeltex", name: "REGELTEX", logo: "/images/brands/regeltex.webp" },
];

export const brandById = (id: string) => BRANDS.find(brand => brand.id === id);

const brandsByName = new Map(BRANDS.map(brand => [brand.name.toLowerCase(), brand]));
const brandAliases: Record<string, string> = {
  "redback.co.il": "Redback",
  "carharrt": "Carhartt",
  "ahim cohen": "האחים כהן",
  "ahim cohenn": "האחים כהן",
  "האחים כהן – ביגוד והלבשה": "האחים כהן",
};

export function canonicalBrandName(name?: string): string | undefined {
  const clean = name?.trim().replace(/\s+/g, " ");
  if (!clean) return undefined;
  const key = clean.toLowerCase();
  // This supplier sells many manufacturers; an unidentified import is not a WORKER product.
  if (/^(?:https?:\/\/)?(?:www\.)?worker\.co\.il\/?$/.test(key)) return undefined;
  return brandAliases[key] ?? brandsByName.get(key)?.name ?? brandMentioned(key) ?? clean;
}

function brandMentioned(key: string) {
  const words = key.split(/[^a-z0-9\u0590-\u05ff]+/i).filter(Boolean);
  const found: { name: string; size: number }[] = [];
  for (const brand of BRANDS) {
    const parts = brand.name.toLowerCase().split(/\s+/);
    for (let start = 0; start <= words.length - parts.length; start++) {
      if (parts.every((part, index) => words[start + index] === part)) {
        found.push({ name: brand.name, size: parts.length });
        break;
      }
    }
  }
  const longest = Math.max(0, ...found.map((item) => item.size));
  const best = found.filter((item) => item.size === longest);
  return best.length === 1 ? best[0].name : undefined;
}

export const uniqueBrandNames = (names: string[]) => [...new Set(names.map(canonicalBrandName).filter((name): name is string => !!name))];
export const brandByName = (name?: string) => {
  const canonical = canonicalBrandName(name);
  return canonical ? brandsByName.get(canonical.toLowerCase()) : undefined;
};
