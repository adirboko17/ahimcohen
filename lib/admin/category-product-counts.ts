import "server-only";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { supplierStorefrontCollections } from "@/lib/suppliers/storefront-collections";
import { shopFilter, supplierRequest } from "@/lib/suppliers/storage";

export type CategoryProductCounts = Record<string, { total: number; subs: Record<string, number> }>;

type ProductPage = {
  nodes: { id: string; status: string; handle: string }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
type CollectionPage = { id: string; products: ProductPage };
type SupplierAssignment = { source_id: string; supplier: string; collection_ids: string[] };

const productFields = "nodes{id status handle} pageInfo{hasNextPage endCursor}";
const supplierPageSize = 200;

async function readAssignedSupplierProducts() {
  const assignments: SupplierAssignment[] = [];
  for (let offset = 0; ; offset += supplierPageSize) {
    const page = await supplierRequest<SupplierAssignment>("ahim_supplier_previews", "GET", {
      ...shopFilter(), shopify_product_id: "is.null", review_state: "in.(known,pending)",
      collection_ids: "not.eq.{}", select: "supplier,source_id,collection_ids",
      order: "supplier.asc,source_id.asc", limit: String(supplierPageSize), offset: String(offset),
    });
    assignments.push(...page);
    if (page.length < supplierPageSize) return assignments;
  }
}

async function readCollectionProductIds(ids: string[]) {
  const result = new Map<string, Set<string>>();
  const addPage = (target: Set<string>, page: ProductPage) => {
    for (const product of page.nodes) {
      if (product.status !== "ARCHIVED" && !/^ahim-bundle-[a-f0-9]{24}$/.test(product.handle)) target.add(product.id);
    }
  };
  for (let start = 0; start < ids.length; start += 6) {
    const batch = ids.slice(start, start + 6);
    const { nodes } = await adminGraphQL<{ nodes: (CollectionPage | null)[] }>(
      "query CategoryProductMemberships($ids:[ID!]!){nodes(ids:$ids){... on Collection{id products(first:100){" + productFields + "}}}}",
      { ids: batch },
    );
    for (const node of nodes) {
      if (!node) continue;
      const members = new Set<string>();
      result.set(node.id, members);
      let page = node.products;
      addPage(members, page);
      while (page.pageInfo.hasNextPage) {
        const after = page.pageInfo.endCursor;
        if (!after) throw new Error("Shopify returned an incomplete collection page.");
        const { collection } = await adminGraphQL<{ collection: CollectionPage | null }>(
          "query CategoryProductMembershipsPage($id:ID!,$after:String!){collection(id:$id){id products(first:100,after:$after){" + productFields + "}}}",
          { id: node.id, after },
        );
        if (!collection || collection.products.pageInfo.endCursor === after)
          throw new Error("Shopify returned an incomplete collection page.");
        page = collection.products;
        addPage(members, page);
      }
    }
  }
  return result;
}

export async function readCategoryProductCounts(): Promise<CategoryProductCounts> {
  const [collections, assignments] = await Promise.all([supplierStorefrontCollections(), readAssignedSupplierProducts()]);
  const placed = collections.filter(collection => collection.paths.length);
  const productsByCollection = await readCollectionProductIds(placed.map(collection => collection.id));
  for (const product of assignments) {
    const key = JSON.stringify([product.supplier, product.source_id]);
    for (const id of product.collection_ids) productsByCollection.get(id)?.add(key);
  }

  const categories = new Map<string, { total: Set<string>; subs: Map<string, Set<string>> }>();
  for (const collection of placed) {
    const members = productsByCollection.get(collection.id);
    if (!members?.size) continue;
    for (const { parentId, sub } of collection.paths) {
      const category = categories.get(parentId) ?? { total: new Set<string>(), subs: new Map<string, Set<string>>() };
      const child = sub ? category.subs.get(sub) ?? new Set<string>() : undefined;
      for (const id of members) {
        category.total.add(id);
        child?.add(id);
      }
      if (child) category.subs.set(sub, child);
      categories.set(parentId, category);
    }
  }
  return Object.fromEntries([...categories].map(([id, { total, subs }]) => [id, {
    total: total.size, subs: Object.fromEntries([...subs].map(([label, members]) => [label, members.size])),
  }]));
}
