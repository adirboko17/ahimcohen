import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";
import { setTimeout as sleep } from "node:timers/promises";

const connections = new https.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 1, timeout: 20000 });
export function normalizeDomain(input: string) {
  let url: URL;
  try {
    url = new URL(input.includes("://") ? input.trim() : "https://" + input.trim());
  } catch {
    throw new Error("הזינו דומיין תקין.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/i.test(url.hostname) ||
    /\.(localhost|local|internal)$/i.test(url.hostname)
  ) {
    throw new Error("הזינו דומיין ציבורי, למשל redback.co.il.");
  }
  return url.hostname;
}

type StorefrontQuery = { query: string; variables: Record<string, unknown> };
export async function publicBytes(url: URL, maxBytes: number, query?: StorefrontQuery) {
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    throw new Error("נדרשת כתובת HTTPS ציבורית.");
  normalizeDomain(url.hostname);
  const ips = await lookup(url.hostname, { family: 4, all: true });
  if (!ips.length || ips.some((a) => ipaddr.parse(a.address).range() !== "unicast"))
    throw new Error("כתובת האתר אינה ציבורית.");
  // Pin the connection to the checked IP, retaining the original hostname for TLS.
  return new Promise<{ body: Buffer; status: number; headers: import("node:http").IncomingHttpHeaders }>(
    (resolve, reject) => {
      const req = https.request(
        url,
        {
          family: 4,
          method: query ? "POST" : "GET",
          agent: connections,
          signal: AbortSignal.timeout(20000),
          lookup: (_host, _options, cb) => cb(null, ips[0].address, 4),
          headers: { "User-Agent": "AhimCatalog/1.0", "Accept": "*/*", "Accept-Encoding": "identity",
            ...(query ? { "Content-Type":"application/json" } : {}) },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) req.destroy(new Error("תשובת הספק גדולה מדי."));
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({ body: Buffer.concat(chunks), status: res.statusCode ?? 0, headers: res.headers }),
          );
        },
      );
      req.on("error", reject);
      req.end(query ? JSON.stringify(query) : undefined);
    },
  );
}
export async function canonicalDomain(input: string) {
  const domain = normalizeDomain(input);
  try {
    const current = new URL("https://" + domain + "/robots.txt");
    const response = await publicBytes(current, 512000);
    if ([301, 302, 307, 308].includes(response.status) && response.headers.location) {
      const target = new URL(response.headers.location, current);
      if (target.protocol === "https:" && target.hostname.replace(/^www\./, "") === domain.replace(/^www\./, ""))
        return normalizeDomain(target.hostname);
    }
  } catch {
    /* Discovery records a readable failure for this domain. */
  }
  return domain;
}
export async function sourceReader(domain: string) {
  const root = "https://" + normalizeDomain(domain);
  const userAgent = "AhimCatalog";
  const robotsUrl = root + "/robots.txt";
  const robots = await publicBytes(new URL(robotsUrl), 512000);
  if (robots.status !== 404 && robots.status !== 410 && robots.status !== 200)
    throw new Error("לא ניתן לאמת את הוראות הסריקה. בדקו גם אם יש להזין דומיין עם www.");
  const rules = robotsParser(robotsUrl, robots.status === 200 ? robots.body.toString("utf8") : "");
  const delay = Math.max(domain.replace(/^www\./,"") === "worker.co.il" ? 1200 : 220, (rules.getCrawlDelay(userAgent) || 0) * 1000);
  if (delay > 30000) throw new Error("האתר מבקש קצב סריקה איטי יותר מהנתמך.");
  return async (path: string, query?: StorefrontQuery) => {
    const url = new URL(path, root);
    if (url.origin !== root || rules.isAllowed(url.href, userAgent) === false)
      throw new Error("האתר אינו מאפשר סריקה של הכתובת.");
    await sleep(delay);
    let result = await publicBytes(url, 12 * 1024 * 1024, query);
    for (let retry = 0; result.status === 429 && retry < 2; retry++) {
      const hint = result.headers["retry-after"];
      const seconds = hint && /^\d+$/.test(hint) ? Number(hint) : NaN;
      const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(hint || "") - Date.now();
      const wait = Math.max(delay, 2000 * (retry + 1), requested || 0);
      if (wait > 5000) {
        const error = new Error("הספק ביקש להאט את הסריקה. הניסיון הבא ימתין לפי הוראותיו.");
        throw Object.assign(error,{ retryAt:new Date(Date.now()+wait).toISOString() });
      }
      await sleep(wait);
      result = await publicBytes(url, 12 * 1024 * 1024, query);
    }
    if (result.status !== 200)
      throw new Error(`הקטלוג הציבורי לא זמין בדומיין הזה (HTTP ${result.status}).`);
    try {
      return { data: JSON.parse(result.body.toString("utf8")), headers: result.headers };
    } catch {
      throw new Error("האתר אינו מחזיר קטלוג ציבורי נתמך.");
    }
  };
}
