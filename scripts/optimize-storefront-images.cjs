// Rebuild responsive derivatives without changing the source artwork.
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

(async () => {
  const categories = path.join(root, "public/images/categories");
  for (const name of await fs.readdir(categories)) {
    if (!name.endsWith("-v1.webp")) continue;
    for (const width of [320, 640]) {
      await sharp(path.join(categories, name))
        .resize({ width, withoutEnlargement: true }).webp({ quality: 76 })
        .toFile(path.join(categories, name.replace(".webp", `-${width}.webp`)));
    }
  }
  const hero = path.join(root, "public/images/hero");
  for (const width of [480, 800, 1200, 1536]) {
    await sharp(path.join(hero, "workwear-wide-v2-1536.webp"))
      .resize({ width, withoutEnlargement: true }).webp({ quality: 74 })
      .toFile(path.join(hero, `workwear-wide-v3-${width}.webp`));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
