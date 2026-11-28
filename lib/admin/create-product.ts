import "server-only";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { canonicalBrandName } from "@/lib/brands";
import { CATS } from "@/lib/catalog";
import { storefrontCategories } from "@/lib/category-placement";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { storefront } from "@/lib/shopify/client";
import { saveStorefrontCategory } from "@/lib/suppliers/category-approval";
import { makeVisible, sitePublication } from "@/lib/suppliers/publication";
import { supplierStorefrontCollections } from "@/lib/suppliers/storefront-collections";
import { readAdminStore } from "./storage";
import { galleryLimit } from "@/lib/product-gallery";
import { productRequestId, readProductImageReceipt, stageManualProductImage } from "./product-image-upload";

export class InvalidProduct extends Error {}

function field(form: FormData, key: string, limit: number) {
  const value = form.get(key) ?? "";
  if (typeof value !== "string" || value.length > limit) throw new InvalidProduct("בדקו את פרטי המוצר.");
  return value.trim();
}

function price(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) throw new InvalidProduct("הזינו מחיר חיובי עם עד שתי ספרות אחרי הנקודה.");
  return Number(value).toFixed(2);
}

export async function readProductForm(form: FormData) {
  const requestId = field(form, "requestId", 36);
  if (!productRequestId.test(requestId)) throw new InvalidProduct("רעננו את הטופס ונסו שוב.");
  const title = field(form, "title", 255);
  const vendor = canonicalBrandName(field(form, "brand", 100));
  if (!title || !vendor) throw new InvalidProduct("הזינו שם מוצר ושם מותג.");
  const regular = price(field(form, "regular", 11));
  const saleInput = field(form, "sale", 11);
  const sale = saleInput ? price(saleInput) : null;
  if (sale && Number(sale) >= Number(regular)) throw new InvalidProduct("מחיר המבצע צריך להיות נמוך מהמחיר המקורי.");
  const description = field(form, "description", 5000);
  const storedImage = form.get("image");
  const image = storedImage instanceof Blob && storedImage.size ? storedImage : null;
  const receipts = form.getAll("gallery");
  if (receipts.length > galleryLimit || (image && receipts.length)) throw new InvalidProduct(`אפשר לצרף עד ${galleryLimit} תמונות.`);
  const gallery = receipts.map(receipt => readProductImageReceipt(receipt, requestId));
  if (image && (image.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type))) {
    throw new InvalidProduct("בחרו תמונת JPG, PNG או WebP בגודל של עד 4MB.");
  }
  const parents = form.getAll("parent");
  const subs = form.getAll("sub");
  const taxonomy = storefrontCategories(CATS, (await readAdminStore()).categoryPlacements);
  if (!parents.length || parents.length > 50 || parents.length !== subs.length) throw new InvalidProduct("בחרו שיוך קטגוריה לכל שורה.");
  const paths = parents.map((id, index) => {
    const parent = taxonomy.find(category => category.id === id);
    const sub = subs[index];
    if (!parent || typeof sub !== "string" || (sub && !parent.subs.includes(sub))) throw new InvalidProduct("בחרו קטגוריה ותת־קטגוריה תואמות מהרשימה.");
    return { parentId: parent.id, parent: parent.name, sub };
  });
  return { requestId, title, vendor, regular, sale, description, paths, image, gallery };
}

type Input = Awaited<ReturnType<typeof readProductForm>>;
type SavedProduct = { id: string; handle: string; status: string; onSite: boolean; submission: { value: string } | null };
const productFields = `id handle status onSite:publishedOnPublication(publicationId:$channel)
  submission:metafield(namespace:"ahim_admin",key:"submission"){value}`;

async function collectionsFor(paths: Input["paths"]) {
  const options = await supplierStorefrontCollections();
  const ids = new Set<string>();
  for (const { parentId, parent, sub } of paths) {
    const option = options.find(item => item.manual && item.published && item.paths.some(path => path.parentId === parentId && path.sub === sub));
    // A storefront path can initially have only an automated collection or no collection.
    const id = option?.id ?? (await saveStorefrontCategory(sub || parent, sub ? parentId : "")).id;
    ids.add(id);
  }
  return [...ids];
}

export async function publishManualProduct(input: Input) {
  const handle = "ahim-manual-" + input.requestId;
  const channel = sitePublication();
  const bytes = input.image ? Buffer.from(await input.image.arrayBuffer()) : undefined;
  const { image, gallery, ...details } = input;
  const fingerprint = createHash("sha256").update(JSON.stringify(details)).update(bytes ?? "");
  if (gallery.length) fingerprint.update(JSON.stringify(gallery.map(item => item.hash)));
  const digest = fingerprint.digest("hex");
  const { productByIdentifier } = await adminGraphQL<{ productByIdentifier: SavedProduct | null }>(
    `query ManualSubmission($handle:String!,$channel:ID!){productByIdentifier(identifier:{handle:$handle}){${productFields}}}`,
    { handle, channel },
  );
  let product = productByIdentifier;
  if (!product) {
    let files = gallery.length ? gallery.map(({ filename, originalSource }) => ({ filename, originalSource, contentType: "IMAGE", alt: input.title })) : undefined;
    if (bytes && image) {
      const filename = handle + ".webp";
      const originalSource = await stageManualProductImage(bytes, filename);
      files = [{ filename, originalSource, contentType: "IMAGE", alt: input.title }];
    }
    const collections = await collectionsFor(input.paths);
    const descriptionHtml = input.description.split(/\r?\n/).filter(Boolean)
      .map(line => "<p>" + line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</p>").join("");
    const { productSet } = await adminGraphQL<{ productSet: { product: SavedProduct | null; userErrors: { message: string }[] } }>(
      `mutation CreateManualProduct($input:ProductSetInput!,$channel:ID!){productSet(input:$input,synchronous:true){
        product{${productFields}} userErrors{message}}}`,
      { channel, input: { handle, title: input.title, vendor: input.vendor, status: "DRAFT", descriptionHtml, collections, files,
        metafields: [{ namespace: "ahim_admin", key: "submission", type: "single_line_text_field", value: digest }],
        productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
        variants: [{ optionValues: [{ optionName: "Title", name: "Default Title" }], price: input.sale ?? input.regular,
          compareAtPrice: input.sale ? input.regular : null, inventoryItem: { tracked: false, requiresShipping: true } }],
      } },
    );
    if (productSet.userErrors.length) throw new Error(productSet.userErrors.map(error => error.message).join(" · "));
    product = productSet.product;
  }
  if (product?.handle !== handle || product.submission?.value !== digest || !["DRAFT", "ACTIVE"].includes(product.status)) {
    throw new Error("לא ניתן להשלים את הפרסום. בדקו את המוצר ב־Shopify לפני פתיחת טופס חדש.");
  }
  await makeVisible(product);
  for (const ms of [0, 500, 1500]) {
    if (ms) await delay(ms);
    const live = await storefront<{ product: { id: string } | null }>(
      `query ManualProductOnSite($handle:String!){product(handle:$handle){id}}`, { handle },
    );
    if (live.product?.id === product.id) return handle;
  }
  throw new Error("המוצר נשמר ב־Shopify וממתין לאישור מערוץ האתר. נסו שוב מאותו טופס.");
}
