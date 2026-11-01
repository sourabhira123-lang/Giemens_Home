import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBuildEnv, validateSiteUrl } from "./env-utils.mjs";

const pageMeta = JSON.parse(await readFile("src/page-meta.json", "utf8"));
const env = await readBuildEnv();
const siteUrl = env.VITE_SITE_URL?.trim();
const baseUrl = siteUrl ? validateSiteUrl(siteUrl) : undefined;
const outputDirectory = "dist";
const baseHtml = await readFile(join(outputDirectory, "index.html"), "utf8");
const socialImage =
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1200&h=630&q=85";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceMeta(html, attribute, name, content) {
  const selector = new RegExp(
    `<meta\\s+${attribute}="${name}"\\s+content="[^"]*"\\s*\\/?>`,
    "i",
  );
  const replacement = `<meta ${attribute}="${name}" content="${escapeHtml(content)}" />`;
  if (!selector.test(html)) {
    throw new Error(`Missing ${attribute} metadata tag: ${name}`);
  }
  return html.replace(selector, replacement);
}

for (const [route, metadata] of Object.entries(pageMeta)) {
  let html = baseHtml.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(metadata.title)}</title>`,
  );
  html = replaceMeta(html, "name", "description", metadata.description);
  html = replaceMeta(html, "property", "og:title", metadata.title);
  html = replaceMeta(html, "property", "og:description", metadata.description);
  html = replaceMeta(html, "name", "twitter:title", metadata.title);
  html = replaceMeta(html, "name", "twitter:description", metadata.description);
  html = replaceMeta(html, "property", "og:image", socialImage);
  html = replaceMeta(html, "name", "twitter:image", socialImage);

  if (baseUrl) {
    const canonicalUrl = new URL(route, baseUrl).href;
    html = replaceMeta(html, "property", "og:url", canonicalUrl);
    html = html.replace(
      "</head>",
      `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />\n  </head>`,
    );
  }

  const routeDirectory =
    route === "/" ? outputDirectory : join(outputDirectory, route.slice(1));
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(join(routeDirectory, "index.html"), html, "utf8");
}

console.info(`Generated HTML metadata for ${Object.keys(pageMeta).length} routes.`);
