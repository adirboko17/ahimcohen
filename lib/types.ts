export type CartLine = {
  key: string;
  pid: string;
  color: string;
  size: string;
  qty: number;
  variantId?: string;
  unitPrice?: number;
};

export type AddItem = [string, number, string, number];
