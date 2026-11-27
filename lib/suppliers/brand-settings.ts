import "server-only";
import { changeAdminStore, readAdminStore } from "@/lib/admin/storage";
import { supplierBrandDomain, supplierBrandName, supplierDefaultBrand } from "./brand";

export async function readSupplierDefaultBrand(domain: string) {
  const store = await readAdminStore();
  return supplierDefaultBrand(domain, store.supplierDefaultBrands);
}

export async function saveSupplierDefaultBrand(domain: string, value: string) {
  const raw = value.trim();
  const name = supplierBrandName(raw);
  if (raw.length > 150 || (raw && !name)) throw new Error("יש להזין שם מותג תקין באורך של עד 150 תווים, או להשאיר ריק.");
  await changeAdminStore(store => {
    store.supplierDefaultBrands = { ...store.supplierDefaultBrands, [supplierBrandDomain(domain)]: name };
  });
  return name;
}
