import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getAuthenticatedUser,
  hasSameOrigin,
  type AuthenticatedUser,
} from "../server/auth.ts";
import { prisma } from "../server/prisma.ts";
import type {
  JurivanaRequestStatus,
  JurivanaRequestType,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

type CrmRequest = IncomingMessage & { body?: unknown; ip?: string };
type CrmResponse = ServerResponse & { statusCode: number };
type Resource =
  | "dashboard"
  | "customers"
  | "projects"
  | "tasks"
  | "requests"
  | "activities"
  | "users";

class CrmInputError extends Error {}

const pageSizeLimit = 100;
const projectStatuses: ProjectStatus[] = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const taskStatuses: TaskStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"];
const requestTypes: JurivanaRequestType[] = [
  "LEGAL",
  "COMPLIANCE",
  "PROPERTY_VERIFICATION",
  "BUSINESS_REGISTRATION",
];
const requestStatuses: JurivanaRequestStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(request: CrmRequest): Record<string, unknown> | undefined {
  const raw = request.body;
  if (typeof raw === "string" || Buffer.isBuffer(raw)) {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
    if (Buffer.byteLength(text, "utf8") > 16_000) return undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (!isRecord(raw)) return undefined;
  try {
    return Buffer.byteLength(JSON.stringify(raw), "utf8") <= 16_000 ? raw : undefined;
  } catch {
    return undefined;
  }
}

function sendJson(response: CrmResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

function getResource(request: CrmRequest): Resource | undefined {
  let url: URL;
  try {
    url = new URL(request.url ?? "/api/crm", "http://localhost");
  } catch {
    return undefined;
  }
  const value = url.searchParams.get("resource");
  return value === "dashboard" ||
    value === "customers" ||
    value === "projects" ||
    value === "tasks" ||
    value === "requests" ||
    value === "activities" ||
    value === "users"
    ? value
    : undefined;
}

function isManager(user: AuthenticatedUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "MANAGER";
}

function isAdministrator(user: AuthenticatedUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "ADMIN";
}

function queryOptions(request: CrmRequest) {
  const url = new URL(request.url ?? "/api/crm", "http://localhost");
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get("page")) || 1));
  const pageSize = Math.max(1, Math.min(pageSizeLimit, Number(url.searchParams.get("pageSize")) || 25));
  return {
    page,
    pageSize,
    search: (url.searchParams.get("search") ?? "").trim().slice(0, 120),
    status: url.searchParams.get("status") ?? "",
    type: url.searchParams.get("type") ?? "",
    sort: url.searchParams.get("sort") ?? "createdAt",
    direction: url.searchParams.get("direction") === "asc" ? "asc" as const : "desc" as const,
  };
}

function hasValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getDashboard(user: AuthenticatedUser) {
  const [
    totalLeads,
    qualifiedLeads,
    customers,
    projects,
    tasks,
    openRequests,
    recentActivities,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "QUALIFIED" } }),
    prisma.customer.count(),
    prisma.project.count(),
    prisma.task.count(),
    prisma.jurivanaRequest.count({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    isAdministrator(user)
      ? prisma.activity.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { id: true, name: true, subject: true } },
        user: { select: { id: true, name: true } },
      },
      })
      : Promise.resolve([]),
  ]);
  return {
    metrics: {
      totalLeads,
      qualifiedLeads,
      customers,
      projects,
      tasks,
      openRequests,
      revenue: null,
    },
    recentActivities,
  };
}

async function listResource(resource: Resource, request: CrmRequest, user: AuthenticatedUser) {
  const options = queryOptions(request);
  const skip = (options.page - 1) * options.pageSize;

  if (resource === "dashboard") return getDashboard(user);
  if (resource === "users") {
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: { select: { name: true } } },
      take: 250,
    });
    return { items: users, page: 1, pageSize: users.length, total: users.length };
  }
  if (resource === "customers") {
    const where = options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: "insensitive" as const } },
            { email: { contains: options.search, mode: "insensitive" as const } },
            { phone: { contains: options.search, mode: "insensitive" as const } },
          ],
        }
      : {};
    const orderBy =
      options.sort === "name" ? { name: options.direction } : { createdAt: options.direction };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        skip,
        take: options.pageSize,
        include: { _count: { select: { projects: true, requests: true } } },
      }),
      prisma.customer.count({ where }),
    ]);
    return { items, page: options.page, pageSize: options.pageSize, total };
  }
  if (resource === "projects") {
    const where = {
      ...(hasValue(projectStatuses, options.status) ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { name: { contains: options.search, mode: "insensitive" as const } },
              { description: { contains: options.search, mode: "insensitive" as const } },
              { customer: { name: { contains: options.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const orderBy =
      options.sort === "name" ? { name: options.direction } : { createdAt: options.direction };
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy,
        skip,
        take: options.pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);
    return { items, page: options.page, pageSize: options.pageSize, total };
  }
  if (resource === "tasks") {
    const where = {
      ...(hasValue(taskStatuses, options.status) ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: "insensitive" as const } },
              { details: { contains: options.search, mode: "insensitive" as const } },
              { project: { name: { contains: options.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const orderBy =
      options.sort === "dueAt" ? { dueAt: options.direction } : { createdAt: options.direction };
    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: options.pageSize,
        include: {
          project: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);
    return { items, page: options.page, pageSize: options.pageSize, total };
  }
  if (resource === "requests") {
    const requestId = new URL(request.url ?? "/api/crm", "http://localhost").searchParams.get("id");
    if (requestId) {
      if (!validId(requestId)) throw new CrmInputError("Submit a valid request ID.");
      const item = await prisma.jurivanaRequest.findUnique({
        where: { id: requestId },
        include: {
          customer: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { id: true, name: true } } },
          },
          documents: {
            where: { document: { status: "READY" } },
            include: {
              document: {
                select: {
                  id: true,
                  fileName: true,
                  contentType: true,
                  sizeBytes: true,
                  category: true,
                  tags: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
      if (!item) throw Object.assign(new Error("Request not found."), { code: "P2025" });
      return { item };
    }
    const where = {
      ...(hasValue(requestStatuses, options.status) ? { status: options.status } : {}),
      ...(hasValue(requestTypes, options.type) ? { type: options.type } : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: "insensitive" as const } },
              { description: { contains: options.search, mode: "insensitive" as const } },
              { customer: { name: { contains: options.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
    const orderBy = { createdAt: options.direction };
    const [items, total] = await Promise.all([
      prisma.jurivanaRequest.findMany({
        where,
        orderBy,
        skip,
        take: options.pageSize,
        include: {
          customer: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { comments: true, documents: true } },
        },
      }),
      prisma.jurivanaRequest.count({ where }),
    ]);
    return { items, page: options.page, pageSize: options.pageSize, total };
  }

  const where = options.search
    ? {
        OR: [
          { type: { contains: options.search, mode: "insensitive" as const } },
          { lead: { name: { contains: options.search, mode: "insensitive" as const } } },
          { lead: { subject: { contains: options.search, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: options.direction },
      skip,
      take: options.pageSize,
      include: {
        lead: { select: { id: true, name: true, subject: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);
  return { items, page: options.page, pageSize: options.pageSize, total };
}

async function createResource(
  database: Prisma.TransactionClient,
  resource: Resource,
  input: Record<string, unknown>,
  user: AuthenticatedUser,
) {
  if (resource === "customers") {
    if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 200) {
      throw new CrmInputError("Enter a customer name between 2 and 200 characters.");
    }
    const email = typeof input.email === "string" && input.email.trim() ? input.email.trim().toLowerCase() : null;
    if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new CrmInputError("Enter a valid customer email.");
    const phone = typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : null;
    if (phone && (phone.length > 24 || !/^\+?[0-9().\-\s]{7,24}$/.test(phone))) throw new CrmInputError("Enter a valid customer phone number.");
    return database.customer.create({
      data: { name: input.name.trim(), email, phone },
    });
  }
  if (resource === "projects") {
    if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 200) {
      throw new CrmInputError("Enter a project name between 2 and 200 characters.");
    }
    if (input.customerId !== undefined && input.customerId !== null && !validId(input.customerId)) {
      throw new CrmInputError("Select a valid customer.");
    }
    if (input.status !== undefined && !hasValue(projectStatuses, input.status)) {
      throw new CrmInputError("Select a valid project status.");
    }
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 5000) throw new CrmInputError("Project description must be under 5000 characters.");
    return database.project.create({
      data: {
        name: input.name.trim(),
        description: description || null,
        customerId: typeof input.customerId === "string" ? input.customerId : null,
        ...(hasValue(projectStatuses, input.status) ? { status: input.status } : {}),
      },
    });
  }
  if (resource === "tasks") {
    if (typeof input.title !== "string" || input.title.trim().length < 2 || input.title.length > 240) {
      throw new CrmInputError("Enter a task title between 2 and 240 characters.");
    }
    if (input.projectId !== undefined && input.projectId !== null && !validId(input.projectId)) {
      throw new CrmInputError("Select a valid project.");
    }
    if (input.assignedToId !== undefined && input.assignedToId !== null && !validId(input.assignedToId)) {
      throw new CrmInputError("Select a valid assignee.");
    }
    if (input.status !== undefined && !hasValue(taskStatuses, input.status)) {
      throw new CrmInputError("Select a valid task status.");
    }
    const details = typeof input.details === "string" ? input.details.trim() : "";
    if (details.length > 5000) throw new CrmInputError("Task details must be under 5000 characters.");
    const dueAt = input.dueAt ? new Date(String(input.dueAt)) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new CrmInputError("Enter a valid task due date.");
    return database.task.create({
      data: {
        title: input.title.trim(),
        details: details || null,
        projectId: typeof input.projectId === "string" ? input.projectId : null,
        assignedToId: typeof input.assignedToId === "string" ? input.assignedToId : null,
        dueAt,
        ...(hasValue(taskStatuses, input.status) ? { status: input.status } : {}),
      },
    });
  }
  if (resource === "requests") {
    if (!validId(input.customerId)) throw new CrmInputError("Select a valid customer.");
    if (!hasValue(requestTypes, input.type)) throw new CrmInputError("Select a valid Jurivana request type.");
    if (typeof input.title !== "string" || input.title.trim().length < 3 || input.title.length > 240) {
      throw new CrmInputError("Enter a request title between 3 and 240 characters.");
    }
    if (typeof input.description !== "string" || input.description.trim().length < 10 || input.description.length > 5000) {
      throw new CrmInputError("Enter a request description between 10 and 5000 characters.");
    }
    return database.jurivanaRequest.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        title: input.title.trim(),
        description: input.description.trim(),
        comments: {
          create: {
            userId: user.id,
            body: "Request created.",
          },
        },
      },
      include: { customer: { select: { id: true, name: true } } },
    });
  }
  throw new CrmInputError("This CRM resource cannot be created.");
}

async function updateResource(
  database: Prisma.TransactionClient,
  resource: Resource,
  input: Record<string, unknown>,
  user: AuthenticatedUser,
) {
  if (!validId(input.id)) throw new CrmInputError("Submit a valid record ID.");
  if (resource === "customers") {
    if (typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 200) {
      throw new CrmInputError("Enter a customer name between 2 and 200 characters.");
    }
    const email = typeof input.email === "string" && input.email.trim()
      ? input.email.trim().toLowerCase()
      : null;
    if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw new CrmInputError("Enter a valid customer email.");
    }
    const phone = typeof input.phone === "string" && input.phone.trim()
      ? input.phone.trim()
      : null;
    if (phone && (phone.length > 24 || !/^\+?[0-9().\-\s]{7,24}$/.test(phone))) {
      throw new CrmInputError("Enter a valid customer phone number.");
    }
    return database.customer.update({
      where: { id: input.id },
      data: { name: input.name.trim(), email, phone },
    });
  }
  if (resource === "projects") {
    if (!hasValue(projectStatuses, input.status)) throw new CrmInputError("Select a valid project status.");
    return database.project.update({
      where: { id: input.id },
      data: { status: input.status },
    });
  }
  if (resource === "tasks") {
    if (!hasValue(taskStatuses, input.status)) throw new CrmInputError("Select a valid task status.");
    return database.task.update({
      where: { id: input.id },
      data: { status: input.status },
    });
  }
  if (resource === "requests") {
    if (input.action === "comment") {
      if (typeof input.body !== "string" || input.body.trim().length < 1 || input.body.length > 5000) {
        throw new CrmInputError("Enter a comment between 1 and 5000 characters.");
      }
      return database.requestComment.create({
        data: { requestId: input.id, userId: user.id, body: input.body.trim() },
        include: { user: { select: { id: true, name: true } } },
      });
    }
    if (input.action === "assign") {
      if (input.assignedToId !== null && !validId(input.assignedToId)) {
        throw new CrmInputError("Select a valid assignee.");
      }
      return database.jurivanaRequest.update({
        where: { id: input.id },
        data: { assignedToId: typeof input.assignedToId === "string" ? input.assignedToId : null },
        include: { assignedTo: { select: { id: true, name: true } } },
      });
    }
    if (!hasValue(requestStatuses, input.status)) throw new CrmInputError("Select a valid request status.");
    return database.jurivanaRequest.update({
      where: { id: input.id },
      data: { status: input.status },
    });
  }
  throw new CrmInputError("This CRM resource cannot be updated.");
}

export function createCrmHandler(dependencies: {
  authenticate: (request: CrmRequest) => Promise<AuthenticatedUser | undefined>;
}) {
  return async function crmHandler(request: CrmRequest, response: CrmResponse): Promise<void> {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (request.method !== "GET" && request.method !== "POST" && request.method !== "PATCH") {
      response.setHeader("Allow", "GET, POST, PATCH");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    let user: AuthenticatedUser | undefined;
    try {
      user = await dependencies.authenticate(request);
    } catch (error) {
      console.error("CRM authentication failed:", error instanceof Error ? error.name : "UnknownError");
      sendJson(response, 503, { error: "CRM access is temporarily unavailable." });
      return;
    }
    if (!user) {
      sendJson(response, 401, { error: "Sign in to access the CRM." });
      return;
    }

    const resource = getResource(request);
    if (!resource) {
      sendJson(response, 400, { error: "Select a valid CRM resource." });
      return;
    }
    if (resource === "activities" && !isAdministrator(user)) {
      sendJson(response, 403, { error: "Your role cannot access lead activity records." });
      return;
    }
    if (request.method !== "GET" && !hasSameOrigin(request)) {
      sendJson(response, 403, { error: "This request is not allowed." });
      return;
    }
    if (request.method !== "GET" &&
      request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      sendJson(response, 415, { error: "Submit CRM changes as JSON." });
      return;
    }

    const input = request.method === "GET" ? undefined : parseBody(request);
    if (request.method !== "GET" && !input) {
      sendJson(response, 400, { error: "Submit a valid JSON object." });
      return;
    }
    const employeeComment =
      user.role === "EMPLOYEE" &&
      resource === "requests" &&
      request.method === "PATCH" &&
      input?.action === "comment";
    if (request.method !== "GET" && !isManager(user) && !employeeComment) {
      sendJson(response, 403, { error: "Your role cannot modify CRM records." });
      return;
    }
    if (resource === "requests" && request.method === "PATCH" && !isAdministrator(user)) {
      if (input?.action === "assign") {
        sendJson(response, 403, { error: "Only administrators can assign requests." });
        return;
      }
    }

    try {
      if (request.method === "GET") {
        sendJson(response, 200, await listResource(resource, request, user));
        return;
      }
      const mutationInput = input!;
      const result = await prisma.$transaction(async (database) => {
        const item =
          request.method === "POST"
            ? await createResource(database, resource, mutationInput, user!)
            : await updateResource(database, resource, mutationInput, user!);
        const itemId =
          typeof item === "object" && item !== null && "id" in item && typeof item.id === "string"
            ? item.id
            : undefined;
        await database.auditLog.create({
          data: {
            actorUserId: user!.id,
            action: `${resource}.${request.method === "POST" ? "create" : "update"}`,
            entityType: resource === "requests" && mutationInput.action === "comment"
              ? "request_comment"
              : resource,
            entityId: itemId,
            details: { resource, method: request.method },
          },
        });
        return item;
      });
      sendJson(response, request.method === "POST" ? 201 : 200, { item: result });
    } catch (error) {
      if (error instanceof CrmInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code === "P2025") {
        sendJson(response, 404, { error: "The requested CRM record was not found." });
        return;
      }
      if (code === "P2002") {
        sendJson(response, 409, { error: "A conflicting CRM record already exists." });
        return;
      }
      if (code === "P2003") {
        sendJson(response, 400, { error: "The selected related record does not exist." });
        return;
      }
      console.error("CRM operation failed:", error instanceof Error ? error.name : "UnknownError");
      sendJson(response, 503, { error: "The CRM operation could not be completed." });
    }
  };
}

export default createCrmHandler({ authenticate: getAuthenticatedUser });
