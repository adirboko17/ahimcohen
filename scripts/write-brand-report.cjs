const fs = require('node:fs');
const audit = require('../assets/brand-audit-results.json');
const review = require('../assets/brand-followup-review.json');
const sorted = Object.entries(audit.counts).filter(([brand]) => brand !== 'האחים כהן').sort((a,b) => b[1]-a[1]);
const additions = Object.entries(review.counts).sort((a,b) => b[1]-a[1]);
const newBrands = additions.filter(([brand, count]) => audit.counts[brand] === count).map(([brand]) => brand);
const line = row => '| ' + row.map(value => String(value ?? '').replaceAll('|','/')).join(' | ') + ' |';
const summary = `# בדיקה נוספת: 336 מוצרים ללא מותג

נבדק ב־13.11.2026. כל 336 המוצרים נבדקו מול המק״טים בקטלוג העסקי הציבורי של Worker. בנוסף נבדקו תמונות המקור של 91 מוצרים ללא מענה ברור או עם סתירה, ונעשו הצלבות לדגמי יצרן.

זוהו ${review.statuses.confirmed} מוצרים נוספים (${(review.statuses.confirmed/review.total*100).toFixed(1)}%). נותרו ${review.total-review.statuses.confirmed}: ${review.statuses.unresolved} ללא ראיה מספקת, ${review.statuses.candidate} מועמדים לא מאומתים, ו־${review.statuses.conflict} עם סתירה.

נוספו ${newBrands.length} מותגים לרשימה: ${newBrands.join(', ')}.

המיפוי עודכן בקוד האתר המקומי, כולל עמודי המותגים. שדה Vendor ב־Shopify לא שונה ולא בוצע פרסום לאתר החי. 12 הלוגואים הראשיים נשמרו; למותגים הנוספים יש קישורים בשם המותג בעמוד כל המותגים.

## השיוכים החדשים

| מותג | מוצרים נוספים |
|---|---:|
${additions.map(line).join('\n')}

## מקרים שדרשו בדיקה פרטנית

- פליז 3540: זוהה כ־WECAMP לפי שם המוצר ותווית הצוואר; נפתרה הסתירה מול שדה WORKER אצל הספק.
- מגיני ברכיים 990: לוגו JSP נראה בתמונה. מוצר בשם דומה בקטלוג החדש הוא WORKER אך המק״ט שלו שונה, ולכן לא נעשתה התאמה לפי שם בלבד.
- כפפות נאופרין 839: שדה המותג של המק״ט המדויק הוא WORKER. מוצר Neri בשם דומה הוא מק״ט 4053, ואינו אותו דגם.
- כפפות MB26: REGELTEX מופיע על הכפפה לצד FLEX & GRIP; שדה WORKER אצל הספק הוא כללי.
- כפפות NINJA ICE, מק״ט 4044-2: התמונה מציגה PORTWEST A146, אך התיאור ורשומת המק״ט הישן מפנים למוצר אחר של Neri. לא שויכו; נדרשת בדיקת המוצר או האריזה בפועל.

## המוצרים שנותרו לבדיקה

| מק״ט | מוצר | מותג אפשרי / מצב |
|---|---|---|
${review.products.filter(p=>p.status!=='confirmed').map(p=>line([p.sku,p.title,p.candidate || 'לא זוהה'])).join('\n')}

קובץ brand-followup-336.csv מכיל שורה לכל אחד מ־336 המוצרים, סטטוס, מותג, נימוק וקישורים למקורות. brand-followup-review.json מכיל גם את רשומות המק״ט המקוריות ששימשו להתאמה. אין שיוכים לפי תחילת מק״ט בלבד, דמיון חזותי כללי או שם רכיב כגון Vibram/3M/YKK.

מקורות מרכזיים: [קטלוג Worker העסקי](https://business.worker.co.il/), שדה brands ברשומות המוצרים הציבוריות, תמונות Shopify של המוצרים, ומקורות היצרנים המצורפים לכל שורה. הבדיקות המקומיות למיפוי ולטעינת הקטלוג עברו: 12/12.
`;
fs.writeFileSync('assets/brand-followup-summary.md', summary);
fs.writeFileSync('assets/brand-audit.md', `# בדיקת מותגים — האחים כהן

קטלוג Shopify נדגם ב־12.11.2026; בדיקת ההשלמה בוצעה ב־13.11.2026.

מתוך ${audit.total} מוצרים זוהו ${audit.identified}; ${audit.unresolvedCount} נותרו ללא שיוך ודאי. זוהו ${sorted.length} מותגים, בנוסף לשם החנות. מתוך 336 המוצרים שנותרו לאחר הבדיקה הראשונה, בדיקת ההשלמה זיהתה ${review.statuses.confirmed} והוסיפה ${newBrands.length} מותגים.

| מותג | מוצרים מזוהים בכל החנות |
|---|---:|
${sorted.map(line).join('\n')}

השיוך נשמר באתר המקומי בלבד; שדה Vendor ב־Shopify לא שונה ולא בוצע פרסום. כאשר למוצר יש Vendor מפורש שאינו worker.co.il הוא מקבל קדימות על המיפוי, כך שתיקון עתידי בשופיפיי יכובד.

ראיות מלאות: brand-audit-results.json, brand-followup-review.json. דוח ההשלמה ורשימת 43 המוצרים הפתוחים: brand-followup-summary.md. טבלה לבדיקה: brand-followup-336.csv. מקורות הלוגואים: brand-logo-sources.json.

מקורות: [קטלוג Worker](https://www.worker.co.il/collections/all), [הקטלוג העסקי של Worker](https://business.worker.co.il/), תמונות המוצרים ומקורות היצרנים המפורטים ברשומות הראיות. התאמות נעשו לפי מק״ט מלא, דגם יצרן או מיתוג מפורש; לא לפי תחילת מק״ט או שם גנרי בלבד.

הפקה חוזרת מהראיות השמורות: node scripts/review-brand-followup.cjs ואז node scripts/build-brand-index.cjs ואז node scripts/write-brand-report.cjs. לפני שימוש בקטלוג חדש יש לבחון שוב התאמות, חריגים וסתירות. scripts/audit-legacy-brands.cjs מבצע קריאה ציבורית בלבד מהספק; אין כתיבות ל־Shopify.
`);
console.log({ brands: sorted.length, newBrands: newBrands.length, confirmed: review.statuses.confirmed, remaining: audit.unresolvedCount });
