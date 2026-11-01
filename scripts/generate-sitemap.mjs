import { readFile, writeFile } from "node:fs/promises";
import { readBuildEnv, validateSiteUrl } from "./env-utils.mjs";

const env = await readBuildEnv();
const siteUrl = env.SITE_URL ?? env.VITE_SITE_URL;

if (!siteUrl) {
  if (env.VERCEL === "1" && env.VERCEL_ENV === "production") {
    throw new Error("VITE_SITE_URL is required to generate the production sitemap.");
  }
  console.info("Skipping sitemap generation: set VITE_SITE_URL to the production site origin.");
  process.exit(0);
}

const baseUrl = new URL(validateSiteUrl(siteUrl.trim()));

const pageMeta = JSON.parse(await readFile("src/page-meta.json", "utf8"));
const routes = Object.keys(pageMeta);

const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const entries = routes
  .map((route) => `  <url><loc>${escapeXml(new URL(route, baseUrl).href)}</loc></url>`)
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

await writeFile("dist/sitemap.xml", sitemap, "utf8");
const robotsPath = "dist/robots.txt";
const robots = await readFile(robotsPath, "utf8");
await writeFile(
  robotsPath,
  `${robots.replace(/\n?Sitemap: .*$/m, "").trimEnd()}\nSitemap: ${new URL("/sitemap.xml", baseUrl).href}\n`,
  "utf8",
);
console.info(`Generated sitemap.xml with ${routes.length} routes.`);
