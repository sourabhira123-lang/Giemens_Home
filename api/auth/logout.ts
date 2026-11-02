import type { IncomingMessage, ServerResponse } from "node:http";
import {
  hasSameOrigin,
  revokeSession,
  sessionCookieName,
} from "../../server/auth.ts";

type AuthRequest = IncomingMessage & { ip?: string };
type AuthResponse = ServerResponse & { statusCode: number };

function sendJson(response: AuthResponse, status: number, body: object) {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

export default async function handler(
  request: AuthRequest,
  response: AuthResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!hasSameOrigin(request)) {
    sendJson(response, 403, { error: "This request is not allowed." });
    return;
  }

  try {
    await revokeSession(request);
    response.setHeader(
      "Set-Cookie",
      `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    );
    sendJson(response, 200, { authenticated: false });
  } catch (error) {
    console.error(
      "Session revocation failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    sendJson(response, 503, { error: "Sign-out is temporarily unavailable." });
  }
}
