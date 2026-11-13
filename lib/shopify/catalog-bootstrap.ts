import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const decompress = promisify(gunzip);
type Bootstrap = { version: number; scope: string; createdAt: string; encoded: string };
let snapshot: Promise<Bootstrap | null> | undefined;

// Server-only build artifact, explicitly included in the deployment's file trace.
// Never put credentials or this file in public/. Development without it still
// uses the normal live loader. A corrupt or differently scoped seed is ignored.
export async function readCatalogBootstrap(scope: string): Promise<string | null> {
  snapshot ??= readFile(join(process.cwd(), ".generated/catalog-bootstrap.json"), "utf8")
    .then(async text => {
      const seed = JSON.parse(text) as Bootstrap;
      if (seed.version !== 1 || !seed.scope || !Number.isFinite(Date.parse(seed.createdAt)) || !seed.encoded) return null;
      const catalog = JSON.parse((await decompress(Buffer.from(seed.encoded, "base64"))).toString("utf8"));
      if (!Array.isArray(catalog.products) || !catalog.products.length || !Array.isArray(catalog.categories)) return null;
      return seed;
    }).catch(() => null);
  const seed = await snapshot;
  return seed?.scope === scope ? seed.encoded : null;
}
