import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthenticatedUser } from "../../server/auth.ts";

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
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  try {
    const user = await getAuthenticatedUser(request);
    sendJson(response, 200, user ? { authenticated: true, user } : { authenticated: false });
  } catch (error) {
    console.error(
      "Session lookup failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    sendJson(response, 503, { error: "Session validation is temporarily unavailable." });
  }
}
