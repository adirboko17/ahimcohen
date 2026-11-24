export type PackUnit = { variantId: string; quantity: number };

export type CartLine = {
  instanceId?: string;
  key: string;
  pid: string;
  color: string;
  size: string;
  qty: number;
  variantId?: string;
  unitPrice?: number;
  packUnits?: PackUnit[];
};

export type AddItem = [string, number, string, number, PackUnit[]?];

// Snapshot the ordered color name, never its position in a mutable catalog.
export type OrderLine = [productId: string, color: string, size: string, quantity: number];
