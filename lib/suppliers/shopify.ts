import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { shopDomain } from "@/lib/shopify/config";
import { type SupplierProduct } from "./redback";
import { reserveDraft, saveDraftId, saveVerification, type Preview } from "./storage";

import { productBrand, productDomain, supplierKey } from "./catalog-model";
import { publicBytes } from "./public-source";

type Collection = { id: string; title: string; handle: string; onSite?: boolean; ruleSet: null | { appliedDisjunctively: boolean } };
type Connection<T> = { nodes: T[]; pageInfo?: { hasNextPage: boolean; endCursor: string } };
export async function supplierCollections(publication?: string) {
  const all: Collection[] = [];
  let after: string | null = null;
  do {
    const data: {
      shop: { currencyCode: string };
      collections: Connection<Collection> & { pageInfo: { endCursor: string; hasNextPage: boolean } };
    } = await adminGraphQL(
      `query SupplierCollections($after:String${publication ? ",$publication:ID!" : ""}){
        shop {currencyCode} collections(first:250,after:$after){
        nodes {id title handle ruleSet {appliedDisjunctively} ${publication ? "onSite:publishedOnPublication(publicationId:$publication)" : ""}}
        pageInfo{endCursor hasNextPage}}}`,
      publication ? { after, publication } : { after },
    );
    if (data.shop.currencyCode !== "ILS") throw new Error("מטבע החנות שונה ממטבע הספק.");
    all.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (after);
  return all;
}

export async function manualCollections() {
  return (await supplierCollections()).filter(c => !c.ruleSet);
}

type Memberships = { id: string; collections: Required<Connection<{ id: string }>>; reviewedCategory?: { value: string } | null };

export async function supplierCollectionMemberships(productIds: string[], reviews?: Map<string, string>) {
  const ids = [...new Set(productIds)];
  const result = new Map<string, string[]>();
  for (let start = 0; start < ids.length; start += 20) {
    const { nodes } = await adminGraphQL<{ nodes: (Memberships | null)[] }>(
      `query SupplierProductCollections($ids:[ID!]!){nodes(ids:$ids){... on Product{
        id collections(first:40){nodes{id} pageInfo{hasNextPage endCursor}}
        ${reviews ? 'reviewedCategory:metafield(namespace:"ahim_supplier",key:"reviewed_category"){value}' : ""}}}}`,
      { ids: ids.slice(start, start + 20) },
    );
    for (const node of nodes) {
      if (!node) continue;
      let page = node.collections;
      const collections = page.nodes.map(c => c.id);
      while (page.pageInfo.hasNextPage) {
        const after = page.pageInfo.endCursor;
        const { product } = await adminGraphQL<{ product: Memberships | null }>(
          `query SupplierProductCollectionsPage($id:ID!,$after:String){product(id:$id){
            id collections(first:100,after:$after){nodes{id} pageInfo{hasNextPage endCursor}}}}`,
          { id: node.id, after },
        );
        if (!product || !after || product.collections.pageInfo.endCursor === after) {
          throw new Error("רשימת האוספים של מוצר מקושר לא נקראה במלואה.");
        }
        page = product.collections;
        collections.push(...page.nodes.map(c => c.id));
      }
      result.set(node.id, collections);
      if (node.reviewedCategory) reviews?.set(node.id, node.reviewedCategory.value);
    }
  }
  return result;
}

export async function addSupplierCollectionMembership(productId: string, collectionId: string) {
  const { collectionAddProducts } = await adminGraphQL<{ collectionAddProducts: { userErrors: { message: string }[] } }>(
    `mutation AddSupplierProductToCategory($id:ID!,$productIds:[ID!]!){
      collectionAddProducts(id:$id,productIds:$productIds){userErrors{message}}}`,
    { id: collectionId, productIds: [productId] },
  );
  checkErrors(collectionAddProducts.userErrors);
}

export async function removeSupplierCollectionMembership(productId: string, collectionId: string) {
  const { collectionRemoveProducts } = await adminGraphQL<{ collectionRemoveProducts: { job: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation RemoveSupplierProductFromCategory($id:ID!,$productIds:[ID!]!){
      collectionRemoveProducts(id:$id,productIds:$productIds){job{id} userErrors{message}}}`,
    { id: collectionId, productIds: [productId] },
  );
  checkErrors(collectionRemoveProducts.userErrors);
  if (!collectionRemoveProducts.job) throw new Error("Shopify טרם אישרה את הסרת השיוך הקודם.");
}

export async function markSupplierCategoryReviewed(productId: string, collectionId: string) {
  const { metafieldsSet } = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation MarkSupplierCategoryReviewed($metafields:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$metafields){userErrors{message}}}`,
    { metafields: [{ ...meta("reviewed_category", collectionId), ownerId: productId }] },
  );
  checkErrors(metafieldsSet.userErrors);
}

type FileInput = { originalSource: string; filename: string; alt: string; contentType: "IMAGE" };
async function shopifyImage(product: SupplierProduct, url: string, index: number): Promise<FileInput> {
  const prefix = `${supplierKey(productDomain(product))}-${product.id}-${index + 1}`;
  let originalSource = url;
  let extension = new URL(url).pathname.split(".").pop()!;
  if (extension.toLowerCase() === "svg") {
    const svg = await publicBytes(new URL(url), 16 * 1024 * 1024);
    if (svg.status !== 200) throw new Error("קריאת תמונת הצבע נכשלה.");
    const png = await sharp(svg.body, { limitInputPixels: 24_000_000 }).png().toBuffer();
    type Target = { url: string; resourceUrl: string; parameters: { name: string; value: string }[] };
    const { stagedUploadsCreate } = await adminGraphQL<{
      stagedUploadsCreate: { stagedTargets: Target[]; userErrors: { message: string }[] };
    }>(
      `mutation StageSupplierImage($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,
      {
        input: [
          {
            filename: prefix + ".png",
            mimeType: "image/png",
            resource: "IMAGE",
            httpMethod: "POST",
            fileSize: String(png.length),
          },
        ],
      },
    );
    checkErrors(stagedUploadsCreate.userErrors);
    const target = stagedUploadsCreate.stagedTargets[0];
    if (!target) throw new Error("Shopify לא החזירה יעד העלאה לתמונה.");
    const form = new FormData();
    target.parameters.forEach((p) => form.append(p.name, p.value));
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), prefix + ".png");
    const uploaded = await fetch(target.url, { method: "POST", body: form, signal: AbortSignal.timeout(25000) });
    if (!uploaded.ok) throw new Error("העלאת תמונת הצבע ל־Shopify נכשלה.");
    originalSource = target.resourceUrl;
    extension = "png";
  }
  return {
    originalSource,
    filename: prefix + "." + extension,
    contentType: "IMAGE",
    alt: `${product.title} · תמונה ${index + 1}`,
  };
}

const meta = (key: string, value: string) => ({
  namespace: "ahim_supplier",
  key,
  type: "single_line_text_field",
  value,
});
const escapeText = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function checkErrors(errors: { message: string }[]) {
  if (errors.length) throw new Error(errors.map((x) => x.message).join(" · "));
}
function supplierHandle(p: SupplierProduct) {
  const domain = productDomain(p);
  const key =
    domain === "redback.co.il" ? "redback" : createHash("sha256").update(domain).digest("hex").slice(0, 16);
  return `ahim-${key}-${p.id}`;
}
async function createDraft(p: SupplierProduct, collections: string[], reviewedCategory?: string) {
  if (p.variants.length > 250 || p.images.length > 250)
    throw new Error("מוצר זה דורש ייבוא מדורג של יותר מ־250 וריאציות או תמונות.");
  const files = new Map<string, FileInput>();
  for (const [index, url] of p.images.entries()) files.set(url, await shopifyImage(p, url, index));
  const optionNames = Object.keys(p.variants[0].options);
  const input = {
    title: p.title,
    status: "DRAFT",
    vendor: productBrand(p),
    handle: supplierHandle(p),
    tags: [productBrand(p), "supplier:" + supplierKey(productDomain(p))].filter(Boolean),
    collections,
    files: [...files.values()],
    descriptionHtml: p.description.map((line) => `<p>${escapeText(line)}</p>`).join(""),
    metafields: [meta("product_id", p.id), meta("supplier", productDomain(p)), meta("source_url", p.url),
      ...(reviewedCategory ? [meta("reviewed_category", reviewedCategory)] : [])],
    productOptions: optionNames.map((name) => ({
      name,
      values: [...new Set(p.variants.map((v) => v.options[name]))].map((name) => ({ name })),
    })),
    variants: p.variants.map((v) => ({
      sku: v.sku,
      price: v.price.toFixed(2),
      compareAtPrice: v.regular > v.price ? v.regular.toFixed(2) : null,
      optionValues: optionNames.map((name) => ({ optionName: name, name: v.options[name] })),
      file: files.get(v.image),
      inventoryPolicy: "DENY",
      inventoryItem: { tracked: true },
      metafields: [
        meta("variant_id", v.id),
        meta("source_availability", v.available ? "in_stock" : "out_of_stock"),
      ],
    })),
  };
  const { productSet } = await adminGraphQL<{
    productSet: { product: { id: string } | null; userErrors: { message: string }[] };
  }>(
    `mutation CreateSupplierDraft($input:ProductSetInput!){productSet(input:$input,synchronous:true){product{id} userErrors{message}}}`,
    { input },
  );
  checkErrors(productSet.userErrors);
  if (!productSet.product) throw new Error("Shopify לא החזירה מזהה טיוטה.");
  return productSet.product.id;
}

type Media = { id: string; status: string; alt: string; image?: { url: string } | null };
export type SupplierShopifyProduct = {
  id: string;
  status: string;
  title: string;
  vendor: string;
  tags: string[];
  source: { value: string } | null;
  description: string;
  collections: Connection<{ id: string }>;
  media: Connection<Media>;
  variants: Connection<{
    id: string;
    inventoryPolicy: "CONTINUE" | "DENY";
    inventoryItem: { tracked: boolean };
    sellableOnlineQuantity: number;
    source: { value: string } | null;
    availability: { value: string } | null;
    price: string;
    compareAtPrice: string | null;
    sku: string;
    selectedOptions: { name: string; value: string }[];
    media: Connection<{ id: string }>;
  }>;
};
const variantFields = `id sku price compareAtPrice inventoryPolicy inventoryItem{tracked} sellableOnlineQuantity selectedOptions{name value} media(first:1){nodes{id}}
      source:metafield(namespace:"ahim_supplier",key:"variant_id"){value} availability:metafield(namespace:"ahim_supplier",key:"source_availability"){value}`;
export async function readDraft(identifier: { id: string } | { handle: string }) {
  const { productByIdentifier } = await adminGraphQL<{ productByIdentifier: SupplierShopifyProduct | null }>(
    `query VerifySupplierDraft($identifier:ProductIdentifierInput!){
    productByIdentifier(identifier:$identifier){id status title vendor tags description source:metafield(namespace:"ahim_supplier",key:"product_id"){value}
    collections(first:250){nodes{id}} media(first:250){nodes{id status alt ... on MediaImage{image{url}}}}
    variants(first:50){pageInfo{hasNextPage endCursor} nodes{${variantFields}}}}}`,
    { identifier },
  );
  if (productByIdentifier) {
    let page = productByIdentifier.variants.pageInfo;
    while (page?.hasNextPage) {
      const { product } = await adminGraphQL<{ product: { variants: SupplierShopifyProduct["variants"] } }>(
        `query MoreSupplierVariants($id:ID!,$after:String!){product(id:$id){variants(first:50,after:$after){pageInfo{hasNextPage endCursor} nodes{${variantFields}}}}}`,
        { id: productByIdentifier.id, after: page.endCursor },
      );
      productByIdentifier.variants.nodes.push(...product.variants.nodes);
      page = product.variants.pageInfo;
    }
  }
  return productByIdentifier;
}

export async function importDraft(row: Preview, collectionIds: string[], preview = row.snapshot) {
  if (row.scan_error && !row.shopify_product_id) throw new Error(row.scan_error);
  let p = preview;
  const collections = await manualCollections();
  if (!collectionIds.length || collectionIds.some((id) => !collections.some((c) => c.id === id)))
    throw new Error("יש לבחור אוסף ידני קיים.");
  const known = row.shopify_product_id?.startsWith("gid://shopify/Product/") ? row.shopify_product_id : null;
  let draft = await readDraft(known ? { id: known } : { handle: supplierHandle(p) });
  if (draft && row.draft_snapshot) {
    p = row.draft_snapshot;
    collectionIds = row.collection_ids;
  }
  if (known && !draft) throw new Error("הטיוטה המקושרת אינה קיימת עוד. יש לבדוק אותה בשופיפיי.");
  if (!draft) {
    const token = await reserveDraft(row, p, collectionIds);
    const id = await createDraft(p, collectionIds, !row.import_token ? row.collection_ids.find(id => collectionIds.includes(id)) : undefined);
    await saveDraftId(row, id, token, collectionIds, p);
    draft = await readDraft({ id });
  } else if (
    !known &&
    draft.source?.value === p.id &&
    draft.tags.includes("supplier:" + supplierKey(productDomain(p)))
  ) {
    await saveDraftId(row, draft.id, row.import_token, collectionIds, p);
  }
  if (!draft || draft.source?.value !== p.id || draft.status !== "DRAFT")
    throw new Error("מוצר היעד אינו טיוטה מקושרת של הספק.");
  for (
    let attempt = 0;
    attempt < 5 && draft.media.nodes.some((m) => ["UPLOADED", "PROCESSING"].includes(m.status));
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const refreshed = await readDraft({ id: draft.id });
    if (refreshed) draft = refreshed;
  }
  verifyDraft(draft, p, collectionIds);
  await saveVerification(row, draft.id, collectionIds);
  return {
    url: `https://${shopDomain()}/admin/products/${draft.id.split("/").pop()}`,
    id: draft.id,
    images: draft.media.nodes.length,
    variants: draft.variants.nodes.length,
  };
}

export function verifyDraft(
  draft: SupplierShopifyProduct,
  p: SupplierProduct,
  collectionIds: string[],
  checkAvailability = true,
) {
  if (
    draft.title !== p.title ||
    draft.vendor !== productBrand(p) ||
    (!!productBrand(p) && !draft.tags.includes(productBrand(p))) ||
    p.description.some((line) => !draft.description.includes(line)) ||
    collectionIds.some((id) => !draft.collections.nodes.some((c) => c.id === id))
  ) {
    throw new Error("פרטי הטיוטה או השיוך לאוספים שונים מהתצוגה המקדימה.");
  }
  const media = draft.media.nodes;
  if (
    media.length !== p.images.length ||
    p.images.some((_, i) => !media.some((m) => m.alt === `${p.title} · תמונה ${i + 1}`)) ||
    media.some((m) => m.status !== "READY" || !m.image?.url)
  ) {
    throw new Error("הטיוטה נשמרה. יש לבדוק שוב את קליטת התמונות בשופיפיי.");
  }
  if (draft.variants.nodes.length !== p.variants.length) throw new Error("מספר הווריאציות בטיוטה שונה מהמקור.");
  for (const v of p.variants) {
    const result = draft.variants.nodes.find((item) => item.source?.value === v.id);
    const alt = `${p.title} · תמונה ${p.images.indexOf(v.image) + 1}`;
    const image = media.find((m) => m.alt === alt);
    if (
      !result ||
      !image ||
      result.media.nodes[0]?.id !== image.id ||
      (result.sku || "") !== v.sku ||
      Number(result.price) !== v.price ||
      Number(result.compareAtPrice) !== (v.regular > v.price ? v.regular : 0) ||
      (checkAvailability && result.availability?.value !== (v.available ? "in_stock" : "out_of_stock")) ||
      result.selectedOptions.length !== Object.keys(v.options).length ||
      result.selectedOptions.some((o) => v.options[o.name] !== o.value)
    ) {
      throw new Error(`פרטי וריאציה ${v.id} בטיוטה שונים מהמקור.`);
    }
  }
}
