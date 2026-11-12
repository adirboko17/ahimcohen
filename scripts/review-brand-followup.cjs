// Reproducible record of the 336-product follow-up review (no Shopify writes).
const fs = require('node:fs');
const baseline = require('../assets/brand-followup-baseline.json');
const catalog = require('../assets/brand-catalog-audit.json').products;
const legacy = require('../assets/brand-legacy-supplier.json');
const aliases = { CARHARTT: 'Carhartt', JEEP: 'Jeep', 'NERI ITALY': 'Neri', 'אגו שף': 'Ego Chef' };
const canonical = name => aliases[name] || name;
const visual = {};
// These labels were read in the original Shopify product photographs, not inferred from style.
for (const [brand, skus] of Object.entries({
  WORKER: ['603','3909','1307','1308','218','298V','3565','3797','3819','3864','3865','627','816','816-2','949'],
  Carhartt: ['B2281','B3263','B4207','B2868','B4294'],
  JSP: ['990','3187'],
  KRATOS: ['342K','356K','368K','386K','401K'],
  WYPALL: ['3469'], WECAMP: ['3540'], KOUDX: ['3888'],
  EverBrite: ['3964','3966','3967'], WORKPRO: ['3996'], REGELTEX: ['MB26'],
  RAYOVAC: ['942'], Justrite: ['940'],
})) for (const sku of skus) visual[sku] = brand;
const manufacturer = {
  '155': ['Ego Chef', 'https://www.egochef.it/en/catalogo/sushi/', 'שם Sushi והתמונה תואמים לקטלוג היצרן; גם כותרת הספק מציינת אגו-שף, בניגוד לשדה WORKER הכללי.'],
  '3152': ['JSP', 'https://www.jspsafety.com/products/ppe/hearing-protection/ear-defenders', 'דגם BIG BLUE והצילום תואמים לסדרת BIG של JSP.'],
  '3174': ['KAYO', null, 'שם המותג מופיע במפורש בכותרת המוצר.'],
  '3234': ['SPASCIANI', 'https://www.spasciani.com/wp-content/uploads/2017/07/Spasciani_WEB_SEMIMASCHERE_ENG.pdf', 'דגם DUO KIT ואריזת המוצר תואמים לקטלוג היצרן ולמסכת DUO המזוהה בחנות.'],
  '3265': ['SHOWA', 'https://globusgroup.com/products/7505pf-glove', 'מספר הדגם המלא 7505PF תואם למוצר SHOWA בקטלוג המפיץ.'],
  '343K': ['KRATOS', 'https://kratossafety.com/en/index.php?controller=attachment&id_attachment=3462', 'מספר הדגם המלא FA 60 007 00 מאומת במסמך היצרן.'],
  '410K': ['KRATOS', 'https://catalog.kratossafety.com/general_2025_2026/109/', 'מספר הדגם המלא FA 40 502 15 מופיע בקטלוג היצרן.'],
};
const candidates = {
  '1103W': ['ALBA', 'דגמי סטפני הקרובים 1115/1115W משויכים ל־ALBA, אך אין אישור לדגם הבטיחות הזה.'],
  '364K': ['KRATOS', 'סדרת המק״טים והעיצוב מתאימים; אין לוגו קריא או מספר דגם יצרן מלא.'],
  '503': ['WORKER', 'אמיגו מופיע כיום כדגם של WORKER, אך המק״ט 502N שונה מהמק״ט 503.'],
  '4044-2': ['PORTWEST / Neri', 'סתירה: התמונה מציגה PORTWEST A146; רשומת המק״ט הישן 4044 משויכת ל־Neri והתיאור מתאר טכנולוגיית HPT. דרושה בדיקת אריזה/מוצר בפועל.'],
};
const rows = baseline.map(({handle}) => {
  const p = catalog.find(p => p.handle === handle);
  if (!p) throw new Error(`Missing baseline product: ${handle}`);
  const sku = p.variants.nodes[0]?.sku;
  const models = [...new Set(p.variants.nodes.map(v => v.sku?.replace(/-\d+$/, '')).filter(Boolean))];
  const matches = legacy.products.filter(item => models.includes(item.sku));
  const brands = [...new Set(matches.flatMap(item => item.brands.map(b => canonical(b.name))).filter(b => b !== 'יוניסקס'))];
  const row = { handle, title: p.title, sku, status: 'unresolved', brand: null, reason: 'לא נמצא שדה מותג, דגם יצרן מלא או סימון קריא שמאפשר שיוך ודאי.', sources: [], supplierMatches: matches.map(m => ({ sku: m.sku, title: m.name, brands: m.brands.map(b => canonical(b.name)), url: m.permalink })) };
  if (brands.length === 1) {
    row.status = 'confirmed'; row.brand = brands[0];
    row.reason = 'התאמת מק״ט מדויקת לשדה המותג בקטלוג העסקי של Worker; שם וסוג המוצר נבדקו.';
    row.sources = matches.map(m => m.permalink);
  }
  if (visual[sku]) {
    row.status = 'confirmed'; row.brand = visual[sku];
    row.reason = 'לוגו או שם מותג קריא על המוצר/האריזה בתמונה המקורית בחנות.';
    row.sources = [p.featuredImage.url];
    if (sku === '3540') row.reason += ' כותרת WECAMP ותווית הצוואר מסכימות; שדה הספק WORKER כללי.';
  }
  if (manufacturer[sku]) {
    const [brand, source, reason] = manufacturer[sku];
    row.status = 'confirmed'; row.brand = brand; row.reason = reason;
    row.sources = [source || 'https://ahim-cohen.co.il/products/' + encodeURIComponent(handle), p.featuredImage.url];
  }
  if (candidates[sku]) {
    row.status = sku === '4044-2' ? 'conflict' : 'candidate'; row.brand = null;
    [row.candidate, row.reason] = candidates[sku];
    row.sources = [...matches.map(m => m.permalink), p.featuredImage.url];
  }
  if (!row.sources.length) row.sources = [...matches.map(m => m.permalink), p.featuredImage?.url].filter(Boolean);
  return row;
});
const counts = {}, statuses = {};
for (const row of rows) { statuses[row.status] = (statuses[row.status] || 0) + 1; if(row.brand) counts[row.brand] = (counts[row.brand] || 0) + 1; }
const result = { checkedAt: new Date().toISOString(), supplierCheckedAt: legacy.checkedAt, total: rows.length, statuses, counts, products: rows };
fs.writeFileSync('assets/brand-followup-review.json', JSON.stringify(result, null, 2) + '\n');
const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const statusLabels = { confirmed: 'זוהה', candidate: 'מועמד לא מאומת', conflict: 'סתירה לבדיקה', unresolved: 'לא זוהה' };
const csv = [['מק״ט','מוצר','סטטוס','מותג מאומת','מותג אפשרי','נימוק','מקורות','קישור למוצר'], ...rows.map(r => [r.sku,r.title,statusLabels[r.status],r.brand,r.candidate,r.reason,r.sources.join(' | '),'https://ahim-cohen.co.il/products/'+encodeURIComponent(r.handle)])].map(r => r.map(quote).join(',')).join('\r\n');
fs.writeFileSync('assets/brand-followup-336.csv', '\uFEFF' + csv + '\r\n');
console.log(JSON.stringify({total: rows.length, statuses, counts}, null, 2));
