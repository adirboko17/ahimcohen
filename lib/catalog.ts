import type { OrderLine } from "./types";
import { bagsAndWallets, outdoorFootwear, reflectiveVests, socksAndUnderwear, winterOuterwear, workCoatsAndRobes, workShorts } from "./category-placement";

export const FREE_SHIPPING = 299;

const H = "https://ahim-cohen.co.il/cdn/shop/files/";
export const IM = {
  dry: H + "135.jpg?v=1711113189&width=1000",
  fleece: H + "72975860185642.jpg?v=1791458391&width=1000",
  soft1: H + "PHOTO-2026-10-07-09-25-59.jpg?v=1791412066&width=1400",
  soft2: H + "PHOTO-2026-10-07-09-32-10.jpg?v=1791412071&width=1400",
  leg: H + "102482001-no-plus.jpg?v=1762206453&width=1000",
  k87: H + "B3861.jpg?v=1762208231&width=1000",
};

export { HEX, swatchColor, colorLabel } from "./colors";

export type Category = { id: string; name: string; subs: string[]; image?: string | null };

export type VariantChoice = {
  id: string;
  color: string;
  size: string;
  price: number;
  available: boolean;
  image?: string;
  sku?: string;
  optionsLabel?: string;
  sourceVariantId?: string;
};

export const CATS: Category[] = [
  { id: outdoorFootwear.id, name: outdoorFootwear.parent, subs: ["נעלי בטיחות", "נעלי עבודה ללא מגן", "מגפי עבודה ובטיחות", "נעלי מלונאות ומטבחים", "אביזרי הנעלה ורפידות", outdoorFootwear.sub] },
  { id: "winter", name: "ביגוד חורף", subs: [winterOuterwear.sub, "חליפות גשם", "חרמוניות", "ביגוד תרמי", "חולצות ארוכות"] },
  { id: "pro", name: "ביגוד מקצועי", subs: ["חולצות", "מכנסיים", workShorts, workCoatsAndRobes.sub, "סרבלים"] },
  { id: "safety", name: "מוצרי בטיחות", subs: ["הגנת ראש", "כפפות עבודה", "הגנת ראייה ופנים", "הגנת נשימה", "הגנת שמיעה", "ציוד לעבודה בגובה", "הגנת גוף", "ציוד בטיחות נלווה", "משטפות עינים ומקלחות חירום", "ציוד להגנת הסביבה", "בטיחות בדרכים", "נראות גבוהה", reflectiveVests.sub] },
  { id: "rep", name: "ביגוד ייצוגי", subs: ["חולצות ייצוגיות", "מכנסיים ייצוגיים", "ג'קטים", "חצאיות", "אקססוריז"] },
  { id: "kitchen", name: "מטבח ומזון", subs: ["ג'קט שף", "כובעי שף", "מכנסי שף | מכנסי טבחים", "סינרים"] },
  { id: "disp", name: "חד פעמי", subs: ["ביגוד מקצועי חד פעמי", "אביזרים חד פעמי"] },
  { id: "acc", name: "אביזרים", subs: ["מוצרי ניקיון", bagsAndWallets.sub, "אביזרים למטבח", socksAndUnderwear.sub, "חגורות", "כובעים", "מגבות", "סרטי הדבקה וסימון", "אביזרים נלווים"] },
];

export const SZ = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];
export const SH = ["39", "40", "41", "42", "43", "44", "45", "46"];
export const ONE = ["מידה אחת"];

export type Product = {
  id: string;
  shopifyProductId?: string;
  shopifyVendor?: string;
  name: string;
  publishedAt?: string;
  cat: string;
  sub: string;
  price: number;
  was?: number;
  deal?: [number, number];
  promoLabel?: string;
  colors: string[];
  sizes: string[];
  sku?: string;
  brand?: string;
  imgs?: string[];
  best?: number;
  desc?: string[];
  specs?: [string, string][];
  std?: string[];
  cats?: string[];
  subs?: string[];
  categorySubs?: Record<string, string[]>;
  originalSubcategories?: string[];
  choices?: VariantChoice[];
  bundleSourceId?: string;
  setContents?: { productIds: string[]; variants: { id: string; components: string[] }[] };
  quantityOfferHidden?: boolean;
};

export function productSubcategories(product: Product, categoryId: string) {
  return product.categorySubs ? product.categorySubs[categoryId] ?? [] : [product.sub, ...(product.subs ?? [])];
}

function sh(id: string, name: string, price: number, color: string, std: string[], extra: Partial<Product> = {}): Product {
  return { id, name, cat: "shoes", sub: "נעלי בטיחות", price, colors: [color], sizes: SH, std, ...extra };
}

export const PRODUCTS: Product[] = [
  { id: "p1", name: "חולצת דרייפיט מנדפת זיעה", cat: "pro", sub: "חולצות", price: 29, deal: [6, 100], colors: ["אפור עכבר", "כחול כהה", "לבן", "שחור", "ירוק כהה", "ירוק זוהר", "כתום"], sizes: SZ, sku: "135-4", brand: "worker.co.il", imgs: [IM.dry], best: 1, desc: ["בד 100% פוליאסטר נעים במיוחד ללבישה", "גזרה נוחה לעבודה", "יכולת נידוף זיעה גבוהה המתאימה לאקלים הישראלי"], specs: [["תקן", "נידוף זיעה · מעבדת שנקר"], ["הרכב בד", "100% פוליאסטר"], ["משקל בד", "140 גרם למ״ר"]] },
  { id: "p7", name: "זקט פליז", cat: "winter", sub: winterOuterwear.sub, price: 69, was: 85, deal: [10, 490], colors: ["שחור", "אפור עכבר", "כחול כהה"], sizes: SZ, imgs: [IM.fleece], best: 1 },
  { id: "p8", name: "מעיל סופטשל טקטי עם כובע נשלף", cat: "winter", sub: winterOuterwear.sub, price: 119, was: 150, colors: ["שחור"], sizes: ["S", "M", "L", "XL", "2XL", "3XL"], sku: "15741", brand: "Ahim Cohen", imgs: [IM.soft1, IM.soft2], best: 1, desc: ["מעיל סופטשל עם עמידות למים ורוחות", "בטנת פרווה מחממת", "כובע מתפרק"], specs: [["הרכב בד", "100% פוליאסטר"], ["עמידות", "מים ורוחות"], ["בטנה", "פרווה מחממת"]] },
  { id: "p3", name: "סווטשירט", cat: "winter", sub: winterOuterwear.sub, price: 49, deal: [3, 120], colors: ["אדום", "אפור עכבר", "ירוק בקבוק", "כחול כהה", "לבן", "מלאנז'", "צהוב", "רויאל", "שחור"], sizes: SZ, best: 1 },
  { id: "p2", name: "חולצת טריקו שרוול ארוך", cat: "winter", sub: "חולצות ארוכות", price: 35, deal: [4, 99], colors: ["אפור עכבר", "ירוק בקבוק", "כחול כהה", "לבן", "מלאנז'", "רויאל", "שחור"], sizes: SZ },
  { id: "p6", name: "קפוצ'ון קנגורו", cat: "winter", sub: winterOuterwear.sub, price: 65, deal: [3, 150], colors: ["כחול כהה", "מלאנז'", "שחור"], sizes: SZ },
  { id: "p5", name: "קפוצ'ון טריקו ש.א. עם כיס", cat: "winter", sub: winterOuterwear.sub, price: 45, deal: [3, 99], colors: ["אפור עכבר", "כחול כהה", "מלאנז'", "רויאל"], sizes: SZ },
  { id: "p4", name: "טישירט FORCE® עם כיס ולוגו", cat: "pro", sub: "חולצות", price: 129, deal: [2, 220], colors: ["בז׳", "לבן", "ירוק", "שחור", "חום", "כחול כהה", "ברונזה", "כחול"], sizes: SZ, sku: "106652", brand: "FORCE" },
  { id: "p9", name: "מעיל דובון", cat: "winter", sub: winterOuterwear.sub, price: 140, colors: ["כחול כהה"], sizes: SZ },
  { id: "p10", name: "חליפת גשם ניילון", cat: "winter", sub: "חליפות גשם", price: 99, colors: ["ירוק בקבוק", "כחול כהה", "צהוב"], sizes: SZ },
  { id: "p11", name: "חולצת טי עם כיס לעבודה K87", cat: "rep", sub: "חולצות ייצוגיות", price: 95, colors: ["כחול"], sizes: SZ, sku: "103296.412", imgs: [IM.k87] },
  { id: "p12", name: "מכנסי FORCE BROXTON CARGO", cat: "pro", sub: "מכנסיים", price: 295, colors: ["Shadow"], sizes: ["W30/L30"], sku: "104200.029", brand: "FORCE" },
  { id: "p13", name: "WOMENS FORCE UTILITY LEGGING", cat: "pro", sub: "מכנסיים", price: 329, colors: ["שחור"], sizes: ["XS"], sku: "102482.001", brand: "FORCE", imgs: [IM.leg] },
  sh("s1", "מגף צ'לסי ¾ חום S3 ESD SRC", 299, "חום", ["S3", "ESD", "SRC"], { was: 350, sub: "מגפי עבודה ובטיחות", best: 1 }),
  sh("s12", "נעל עבודה BLAZE AAG בתקן S3", 379, "שחור", ["S3"], { brand: "Redback", sku: "786", sizes: ["EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "EU 46", "EU 47"], desc: ["נעל גבוהה בעלת רפידת קוולאר מיוחדת", "נעל בטיחות בתקן S3", "נעליים אנטיסטטיות", "כיפת מגן העשויה מחומרים מורכבים", "נגד חדירת מים", "סוליה בעלת עמידות גבוהה כנגד נקבים"], best: 1 }),
  sh("s2", "דיגר ¾ שחור S3 SRC", 159, "שחור", ["S3", "SRC"]),
  sh("s3", "דיגר ¾ שחור SB SRC", 159, "שחור", ["SB", "SRC"]),
  sh("s4", "הידרה ¾ חום S3 WR CI SRC", 435, "חום", ["S3", "WR", "CI", "SRC"]),
  sh("s5", "נעל יוניטרק S3 SRC", 380, "שחור", ["S3", "SRC"]),
  sh("s6", "נעל פלרמו ¾ S3 SRC ESD", 395, "חום", ["S3", "SRC", "ESD"]),
  sh("s7", "נעל STROM חום S3 SRC", 395, "חום", ["S3", "SRC"]),
  sh("s8", "נעל אלבני עם רוכסן S3", 350, "צהוב", ["S3"]),
  sh("s9", "מגף קניון ¾ חום SB SRC", 195, "חום", ["SB", "SRC"], { sub: "מגפי עבודה ובטיחות" }),
  sh("s10", "PARKES ZIP מגף בטיחות S3 עם שרוך ורוכסן", 650, "חום", ["S3"], { sub: "מגפי עבודה ובטיחות" }),
  sh("s11", "דטרויט 8 אינץ׳ חום S3 SRC", 795, "חום", ["S3", "SRC"]),
  sh("s13", "מגף S3", 99, "שחור", ["S3"], { sub: "מגפי עבודה ובטיחות" }),
  { id: "a1", name: "כובע דרייפיט קל", cat: "acc", sub: "כובעים", price: 19, colors: ["אדום", "אפור עכבר", "כחול כהה", "לבן", "רויאל"], sizes: ONE },
  { id: "a3", name: "כובע מחמם TELLER שחור", cat: "acc", sub: "כובעים", price: 95, colors: ["שחור"], sizes: ONE, sku: "104068" },
  { id: "a4", name: "כובע אוסטרלי רשת ירוק זית", cat: "acc", sub: "כובעים", price: 59, colors: ["זית"], sizes: ONE },
  { id: "a2", name: "כובע ברש 6 פנל", cat: "acc", sub: "כובעים", price: 17, colors: [], sizes: ONE },
  { id: "g1", name: "מבצע כפפות עבודה – 240 זוגות", cat: "safety", sub: "כפפות עבודה", price: 439, colors: [], sizes: ["מארז 240 זוגות"] },
];

export const PM: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const CM: Record<string, Category> = Object.fromEntries(CATS.map((c) => [c.id, c]));

export const KITS: { id: string; name: string; items: [string, number][] }[] = [
  { id: "k1", name: "ערכת קיץ לשטח", items: [["p1", 6], ["a4", 1], ["s13", 1]] },
  { id: "k2", name: "ערכת חורף", items: [["p7", 1], ["p8", 1], ["p2", 4]] },
  { id: "k3", name: "ערכת צוות ×10", items: [["p7", 10], ["a1", 10]] },
];

export const ANNOUNCEMENTS = [
  "משלוח חינם בהזמנות מעל {thr}",
  "6 חולצות דרייפיט ב-100 ₪ · 10 פליזים ב-490 ₪",
  "הסניף פתוח: הפועלים 20, באר שבע · 08-6233803",
];

export const PROFESSIONS = [
  { name: "תעשייה ובנייה", desc: "נעלי בטיחות S3, כפפות, הגנת ראש ושמיעה", id: "shoes" },
  { name: "מטבח ומזון", desc: "ג'קטים ומכנסי שף, סינרים, נעלי מטבח", id: "kitchen" },
  { name: "ייצוג ושירות", desc: "חולצות, מכנסיים וג׳קטים ייצוגיים", id: "rep" },
  { name: "עבודה בדרכים", desc: "אפודים זוהרים ונראות גבוהה", id: "safety" },
  { name: "מרפאות ומעבדות", desc: "ביגוד ואביזרים חד פעמיים", id: "disp" },
];

export const SERVICES = [
  { t: "הדפס כיס", d: "הדפסת הלוגו בחזית הבגד, באזור הכיס.", bg: "#111", fg: "#fff" },
  { t: "הדפס גב", d: "הדפסת הלוגו על גב הבגד.", bg: "#F4F4F2", fg: "#111" },
  { t: "ייצוגי", d: "מראה אחיד לצוותי שירות, מכירות ומשרד.", bg: "#FFD100", fg: "#111" },
  { t: "כמויות", d: "שילוב פריטים, צבעים ומידות בהזמנה אחת.", bg: "#F4F4F2", fg: "#111" },
];

export type DemoOrder = { no: string; date: string; lines: OrderLine[] };

export const ORDERS: DemoOrder[] = [
  { no: "10482", date: "21.10.2026", lines: [["p1", "אפור עכבר", "L", 6], ["p7", "שחור", "XL", 1], ["p1", "כחול כהה", "XL", 6], ["p7", "אפור עכבר", "L", 1]] },
  { no: "10377", date: "02.09.2026", lines: [["p8", "שחור", "M", 4], ["p3", "ירוק בקבוק", "L", 6]] },
  { no: "10211", date: "14.06.2026", lines: [["p1", "כחול כהה", "XL", 6]] },
];

export const INFO: Record<string, { title: string; lead: string; blocks: { h: string; p: string }[] }> = {
  shipping: {
    title: "משלוחים והחזרות",
    lead: "משלוח עד הבית או איסוף מהסניף בבאר שבע.",
    blocks: [
      { h: "משלוח עד הבית", p: "משלוח חינם בהזמנות מעל 299 ₪. מתחת לסכום הזה עלות המשלוח נקבעת לפי היעד ותופיע לפני התשלום." },
      { h: "איסוף מהסניף", p: "אפשר לאסוף מהסניף בהפועלים 20, באר שבע, בלי עלות. מוזמנים להגיע למדוד לפני שמזמינים." },
      { h: "החזרות", p: "מדיניות ההחזרות המלאה מפורטת בתקנון האתר. פריט שלא נלבש ולא סומן אפשר להחזיר בתיאום עם החנות." },
    ],
  },
  faq: {
    title: "שאלות נפוצות",
    lead: "תשובות קצרות על הזמנה, מידות ומבצעים.",
    blocks: [
      { h: "איך עובד מבצע כמות?", p: "המחיר מתעדכן לבד בסל לפי הכמות. אפשר לשלב צבעים ומידות באותו מבצע, למשל 6 חולצות דרייפיט ב-100 ₪." },
      { h: "איך בוחרים מידה?", p: "בחרו מתוך המידות הזמינות בעמוד המוצר. מתלבטים? אפשר להתקשר אלינו לייעוץ בבחירת המידה." },
      { h: "אפשר להזמין עם לוגו?", p: "כן. בדף הזמנות לעסקים בוחרים פריטים, כמויות ומידות, ומבקשים הדפסה או רקמה. ההצעה נשלחת לצוות ההזמנות." },
      { h: "איפה החנות?", p: "הפועלים 20, באר שבע. טלפון 08-6233803." },
    ],
  },
  contact: {
    title: "צור קשר",
    lead: "הסניף, הטלפון והמייל של צוות ההזמנות.",
    blocks: [
      { h: "סניף", p: "הפועלים 20, באר שבע. מוזמנים להגיע ולמדוד." },
      { h: "טלפון", p: "08-6233803" },
      { h: "הזמנות", p: "Hazmanot@ahim-cohen.co.il" },
    ],
  },
  terms: {
    title: "תקנון האתר",
    lead: "התנאים שלפיהם מתבצעת קנייה באתר האחים כהן.",
    blocks: [
      { h: "הזמנה", p: "השלמת הזמנה באתר היא בקשה לרכישה. ההזמנה מאושרת אחרי קליטת התשלום ובדיקת מלאי." },
      { h: "מחירים ומבצעים", p: "המחירים בשקלים וכוללים מע״מ אלא אם צוין אחרת. מבצע כמות חל כשמגיעים לכמות שבמבצע, גם בשילוב צבעים ומידות." },
      { h: "ביטול והחזרה", p: "אפשר לבטל עסקה לפי חוק הגנת הצרכן, בכפוף למצב הפריט. פריט ממותג בהזמנה אישית מטופל לפי מה שסוכם בהצעת המחיר." },
    ],
  },
  privacy: {
    title: "מדיניות פרטיות",
    lead: "איך נשמרים הפרטים שמשאירים באתר.",
    blocks: [
      { h: "מה נאסף", p: "פרטים שמוסרים בקופה, בחשבון או בבקשת הצעת מחיר: שם, טלפון, כתובת, אימייל ופרטי הזמנה." },
      { h: "למה", p: "כדי לספק את ההזמנה, להוציא מסמך, לחזור עם הצעת מחיר ולשלוח עדכון אם ביקשתם." },
      { h: "פנייה", p: "לבקשת עיון או מחיקה כותבים ל-Hazmanot@ahim-cohen.co.il או מתקשרים ל-08-6233803." },
    ],
  },
  accessibility: {
    title: "הצהרת נגישות",
    lead: "האתר נבנה בעברית, מימין לשמאל, עם ניגודיות גבוהה ומבנה עמודים קבוע.",
    blocks: [
      { h: "מה קיים באתר", p: "טקסט שאפשר להגדיל בדפדפן, כפתורים עם שם, ניווט מקלדת וצבעי טקסט כהים על רקע בהיר. הצהוב משמש להדגשה ולא כטקסט דק על לבן." },
      { h: "נתקלתם בקושי?", p: "כתבו ל-Hazmanot@ahim-cohen.co.il או התקשרו ל-08-6233803 ונטפל." },
    ],
  },
};

export function phOf(p: Product) {
  const cat = CM[p.cat];
  return p.std ? p.std[0] : p.sku || (cat ? cat.name.split(" ")[0] : p.name.split(" ")[0]);
}

export function pickVariant(product: Product, color: string, size: string) {
  const choices = product.choices ?? [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    choices.find((choice) => (!color || same(choice.color, color)) && (!size || same(choice.size, size))) ??
    choices.find((choice) => choice.available) ??
    choices[0]
  );
}

export function productsInCategory(catId: string) {
  return PRODUCTS.filter((p) => p.cat === catId);
}
