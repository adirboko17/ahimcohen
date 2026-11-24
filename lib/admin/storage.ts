import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_HERO, type AdminStore } from "./models";

export const adminDirectory = join(process.cwd(), ".generated", "admin");
export const heroDirectory = join(adminDirectory, "hero");
const dataFile = join(adminDirectory, "store.json");
const initial = (): AdminStore => ({
  bundles: [], offers: [], hiddenQuantityOffers: [], labels: [], reviews: [], links: [], sales: [], heroes: [DEFAULT_HERO], activeHero: DEFAULT_HERO.id,
});

export async function readAdminStore(): Promise<AdminStore> {
  try {
    return { ...initial(), ...JSON.parse(await readFile(dataFile, "utf8")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return initial();
    throw error;
  }
}

let pending = Promise.resolve();

export function changeAdminStore(change: (store: AdminStore) => void | Promise<void>) {
  const result = pending.then(async () => {
    const store = await readAdminStore();
    await change(store);
    await mkdir(adminDirectory, { recursive: true });
    const temporary = join(adminDirectory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(store, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, dataFile);
    } finally {
      await rm(temporary, { force: true });
    }
  });
  pending = result.catch(() => {});
  return result;
}

export function upsert<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) items.unshift(value);
  else items[index] = value;
}
