// Run once from the project root with: node --env-file=.env.local scripts/import-admin.cjs
// Existing cloud settings and accounts take precedence on a repeated import.
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { isDeepStrictEqual } = require("node:util");

async function main() {
  const root = join(process.cwd(), ".generated", "admin");
  const shop = new URL("https://" + process.env.SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, "")).hostname;
  const base = new URL(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (base.protocol !== "https:" || !key) throw new Error("Set the Supabase project URL and server key first.");
  const headers = { apikey: key, ...(key.startsWith("eyJ") && { Authorization: "Bearer " + key }) };
  const request = async (path, options = {}) => {
    const res = await fetch(new URL(path, base), { ...options, headers: { ...headers, ...options.headers }, redirect: "error" });
    if (!res.ok) throw new Error("Admin import request failed: HTTP " + res.status);
    return res;
  };

  const settings = JSON.parse(await readFile(join(root, "store.json"), "utf8"));
  const { email, salt, hash } = JSON.parse(await readFile(join(root, "credentials.json"), "utf8"));
  if (!Array.isArray(settings.heroes) || !email || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) {
    throw new Error("Invalid local admin files.");
  }
  const filenames = new Set(settings.heroes.flatMap(hero => [hero.desktop?.src, hero.mobile?.src])
    .filter(src => src?.startsWith("/media/hero/")).map(src => src.slice("/media/hero/".length)));
  for (const filename of filenames) {
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.webp$/.test(filename)) throw new Error("Invalid legacy image name.");
    const image = await readFile(join(root, "hero", filename));
    const path = "/storage/v1/object/ahim-hero-images/" + shop + "/" + filename;
    const existing = await fetch(new URL(path.replace("/object/", "/object/public/"), base));
    if (existing.ok) {
      if (!image.equals(Buffer.from(await existing.arrayBuffer()))) throw new Error("Stored banner differs from the local copy.");
    } else {
      await request(path, { method: "POST", body: image, headers: { "Content-Type": "image/webp" } });
    }
  }
  for (const [table, fields] of [
    ["ahim_admin_settings", { settings }],
    ["ahim_admin_accounts", { email, salt, hash }],
  ]) {
    const path = "/rest/v1/" + table;
    const inserted = await request(path + "?on_conflict=shop_domain&select=shop_domain", {
      method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ shop_domain: shop, ...fields }),
    });
    const created = (await inserted.json()).length > 0;
    const query = new URLSearchParams({ shop_domain: "eq." + shop, select: Object.keys(fields).join(",") });
    const [row] = await (await request(path + "?" + query)).json();
    if (!row || (created && !isDeepStrictEqual(fields, row))) throw new Error("Import verification failed for " + table);
    console.log(table, created ? "imported and verified" : "already exists, preserved");
  }
  console.log("Referenced banner uploads:", filenames.size);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
