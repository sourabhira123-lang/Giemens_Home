import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import contactHandler from "../api/contact.ts";
import leadsHandler from "../api/leads.ts";
import loginHandler from "../api/auth/login.ts";
import logoutHandler from "../api/auth/logout.ts";
import sessionHandler from "../api/auth/session.ts";
import crmHandler from "../api/crm.ts";
import documentsHandler from "../api/documents.ts";
import {
  checkApplicationReadiness,
  DependencyReadinessError,
} from "./readiness.ts";
import {
  logEvent,
  recordHttpRequest,
  recordStartup,
  renderPrometheusMetrics,
  routeTemplate,
} from "./observability.ts";

type ApiRequest = IncomingMessage & {
  body?: unknown;
  ip?: string;
};

type ApiHandler = (
  request: ApiRequest,
  response: ServerResponse,
) => Promise<void>;

const apiRoutes = new Map<string, ApiHandler>([
  ["/api/contact", contactHandler],
  ["/api/leads", leadsHandler],
  ["/api/auth/login", loginHandler],
  ["/api/auth/logout", logoutHandler],
  ["/api/auth/session", sessionHandler],
  ["/api/crm", crmHandler],
  ["/api/documents", documentsHandler],
]);

const staticRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const maxApiBodyBytes = 64_000;
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-K8HZdC/RJBVlqxAmswWtEiwUEPiVPo5VUOiZn8e6ziI='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self' https://*.blob.core.windows.net; upgrade-insecure-requests",
  );
  response.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
}

function clientIp(request: IncomingMessage, trustedProxyHops: number): string | undefined {
  const remoteAddress = request.socket.remoteAddress;
  if (trustedProxyHops === 0) {
    return remoteAddress && isIP(remoteAddress) ? remoteAddress : undefined;
  }

  const forwarded = request.headers["x-forwarded-for"];
  const chain = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)
    ?.split(",")
    .map((address) => address.trim())
    .filter((address) => isIP(address));
  if (remoteAddress && isIP(remoteAddress)) chain?.push(remoteAddress);
  if (!chain || chain.length <= trustedProxyHops) return undefined;
  return chain[chain.length - 1 - trustedProxyHops];
}

async function readBody(
  request: IncomingMessage,
): Promise<{ body: Buffer } | { tooLarge: true }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxApiBodyBytes) return { tooLarge: true };
    chunks.push(buffer);
  }
  return { body: Buffer.concat(chunks) };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function serveApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  trustedProxyHops: number,
): Promise<void> {
  const handler = apiRoutes.get(pathname);
  if (!handler) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxApiBodyBytes) {
    request.resume();
    sendJson(response, 413, { error: "Request body is too large." });
    return;
  }

  const parsedBody = await readBody(request);
  if ("tooLarge" in parsedBody) {
    sendJson(response, 413, { error: "Request body is too large." });
    return;
  }

  const apiRequest = request as ApiRequest;
  apiRequest.body = parsedBody.body;
  apiRequest.ip = clientIp(request, trustedProxyHops);
  await handler(apiRequest, response);
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  root: string,
): Promise<void> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid path." });
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let filePath = resolve(root, relativePath);
  let fileRelativePath = relative(root, filePath);
  if (fileRelativePath.startsWith("..") || isAbsolute(fileRelativePath)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = resolve(filePath, "index.html");
    else if (!fileStat.isFile()) throw new Error("Not a regular file.");
  } catch {
    if (extname(filePath)) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    filePath = resolve(root, "index.html");
  }

  fileRelativePath = relative(root, filePath);
  if (fileRelativePath.startsWith("..") || isAbsolute(fileRelativePath)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a regular file.");
    setSecurityHeaders(response);
    response.setHeader("Content-Type", mimeTypes[extname(filePath)] ?? "application/octet-stream");
    response.setHeader(
      "Cache-Control",
      extname(filePath) === ".html"
        ? "no-cache"
        : fileRelativePath.replaceAll("\\", "/").startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
    );
    response.statusCode = 200;
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) sendJson(response, 404, { error: "Not found." });
      else response.destroy();
    });
    stream.pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

export function createHttpServer(options?: {
  distDirectory?: string;
  trustedProxyHops?: number;
  checkReadiness?: () => Promise<void>;
}) {
  const root = resolve(options?.distDirectory ?? staticRoot);
  const trustedProxyHops = options?.trustedProxyHops ?? 0;
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 0 || trustedProxyHops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10.");
  }

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    response.setHeader("X-Request-ID", requestId);
    setSecurityHeaders(response);
    response.once("finish", () => {
      let pathname = "/";
      try {
        pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        pathname = "/invalid";
      }
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      recordHttpRequest(request.method, pathname, response.statusCode, durationSeconds);
      const method = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
        .includes(request.method ?? "")
        ? request.method!
        : "OTHER";
      logEvent("info", "http.request.completed", {
        requestId,
        method,
        route: routeTemplate(pathname),
        statusCode: response.statusCode,
        durationSeconds: Number(durationSeconds.toFixed(6)),
      });
    });
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (requestUrl.pathname === "/metrics") {
        const token = process.env.METRICS_AUTH_TOKEN?.trim();
        const authorization = request.headers.authorization;
        const provided = authorization?.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length)
          : "";
        const authorized = Boolean(
          token &&
          Buffer.byteLength(token) >= 32 &&
          Buffer.byteLength(token) === Buffer.byteLength(provided) &&
          timingSafeEqual(Buffer.from(token), Buffer.from(provided)),
        );
        if (!authorized) {
          sendJson(response, 404, { error: "Not found." });
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET, HEAD");
          response.end();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : renderPrometheusMetrics());
        return;
      }
      const isLivenessRoute = ["/healthz", "/health", "/liveness"].includes(requestUrl.pathname);
      if (isLivenessRoute || requestUrl.pathname === "/ready") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET, HEAD");
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }
      }

      if (isLivenessRoute) {
        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : "ok");
        return;
      }

      if (requestUrl.pathname === "/ready") {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        try {
          await (options?.checkReadiness ?? checkApplicationReadiness)();
          response.statusCode = 200;
          response.end(request.method === "HEAD" ? undefined : "ready");
        } catch (error) {
          logEvent("error", "readiness.failed", {
            requestId,
            error: error instanceof Error ? error.name : "UnknownError",
            ...(error instanceof DependencyReadinessError
              ? { dependencies: error.dependencies.join(",") }
              : {}),
          });
          response.statusCode = 503;
          response.end(request.method === "HEAD" ? undefined : "not ready");
        }
        return;
      }

      if (requestUrl.pathname.startsWith("/api/")) {
        await serveApi(request, response, requestUrl.pathname, trustedProxyHops);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      await serveStatic(request, response, requestUrl.pathname, root);
    } catch (error) {
      logEvent("error", "http.request.failed", {
        requestId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      if (!response.headersSent) {
        sendJson(response, 500, { error: "An unexpected error occurred." });
      } else {
        response.destroy();
      }
    }
  });
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  try {
    await checkApplicationReadiness();
  } catch (error) {
    recordStartup("error");
    logEvent("error", "application.start.failed", {
      error: error instanceof Error ? error.name : "UnknownError",
      ...(error instanceof DependencyReadinessError
        ? { dependencies: error.dependencies.join(",") }
        : {}),
    });
    process.exitCode = 1;
    return;
  }
  const server = createHttpServer({ trustedProxyHops });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.listen(port, host, () => {
    recordStartup("started");
    logEvent("info", "application.started", { host, port });
  });
  server.once("error", (error) => {
    recordStartup("error");
    logEvent("error", "application.start.failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  });
  const shutdown = () => {
    server.close((error) => {
      if (error) {
        logEvent("error", "application.shutdown.failed", { error: error.name });
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
