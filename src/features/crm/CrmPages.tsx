import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageMeta, SectionHeading } from "../../components";
import { useAuthUser } from "../auth/AuthPages";

type Resource = "customers" | "projects" | "tasks" | "requests" | "activities";
type RecordRow = Record<string, unknown> & { id: string };
type UserOption = { id: string; name: string };
type PageResult = { items?: RecordRow[]; total?: number; item?: RecordRow };

const resourceTitles: Record<Resource, string> = {
  customers: "Customers",
  projects: "Projects",
  tasks: "Tasks",
  requests: "Jurivana requests",
  activities: "Activities",
};

const options: Record<string, string[]> = {
  projectStatus: ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
  taskStatus: ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"],
  requestStatus: ["SUBMITTED", "IN_REVIEW", "NEEDS_INFORMATION", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  requestType: ["LEGAL", "COMPLIANCE", "PROPERTY_VERIFICATION", "BUSINESS_REGISTRATION"],
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function display(value: unknown): string {
  if (typeof value === "string") return value.replaceAll("_", " ");
  if (typeof value === "number") return value.toLocaleString();
  return "—";
}

function date(value: unknown): string {
  if (typeof value !== "string") return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as
    | (T & { error?: string })
    | undefined;
  if (!response.ok) throw new Error(payload?.error || "The request could not be completed.");
  if (!payload) throw new Error("The server returned an invalid response.");
  return payload;
}

export function AdminDashboard() {
  const user = useAuthUser();
  const [data, setData] = useState<Record<string, unknown>>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<Record<string, unknown>>("/api/crm?resource=dashboard")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = data?.metrics as Record<string, unknown> | undefined;
  const activities = Array.isArray(data?.recentActivities)
    ? data.recentActivities as Record<string, unknown>[]
    : [];
  const cards: Array<[string, unknown]> = [
    ["Total Leads", metrics?.totalLeads],
    ["Qualified Leads", metrics?.qualifiedLeads],
    ["Customers", metrics?.customers],
    ["Projects", metrics?.projects],
    ["Tasks", metrics?.tasks],
    ["Open Requests", metrics?.openRequests],
    ["Revenue", metrics?.revenue === null ? "Coming soon" : metrics?.revenue],
  ];

  return (
    <>
      <PageMeta title="Dashboard | GIEMENS" description="GIEMENS operations dashboard." />
      <section className="section lead-dashboard crm-dashboard">
        <div className="container">
          <SectionHeading eyebrow="GIEMENS administration" title="Dashboard" description="A current overview of leads, customers and delivery." />
          <p className="admin-breadcrumb"><Link to="/admin">Administration</Link> / Dashboard</p>
          {error && <p className="form-status form-status-error" role="alert">{error}</p>}
          {!data && !error && <p aria-live="polite">Loading dashboard…</p>}
          <div className="benefit-grid lead-metrics crm-metrics">
            {cards.map(([label, value]) => (
              <article className="benefit-card" key={label}>
                <span className="benefit-number">{value === undefined ? "—" : display(value)}</span>
                <h3>{label}</h3>
              </article>
            ))}
          </div>
          <div className="lead-dashboard-grid">
            <section>
              <h2 className="lead-panel-heading">Recent activity</h2>
              {activities.length ? (
                <div className="lead-list">
                  {activities.map((activity) => {
                    const lead = activity.lead as Record<string, unknown> | undefined;
                    const actor = activity.user as Record<string, unknown> | undefined;
                    return (
                      <article className="crm-activity" key={text(activity.id)}>
                        <strong>{display(activity.type)}</strong>
                        <span>{display(lead?.name)} · {display(lead?.subject)}</span>
                        <small>{actor ? `By ${display(actor.name)} · ` : ""}{date(activity.createdAt)}</small>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="lead-empty">Activity entries will appear here as work is recorded.</p>
              )}
            </section>
            <section>
              <h2 className="lead-panel-heading">Workspace</h2>
              <div className="crm-quick-links">
                {(["leads", "customers", "projects", "tasks", "requests", ...(user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? ["activities" as const] : []), "documents"] as const).map((item) => (
                  <Link className="button button-outline" key={item} to={`/admin/${item}`}>
                    {item === "requests" ? "Jurivana requests" : item[0].toUpperCase() + item.slice(1)}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}

export function CrmWorkspace({ resource }: { resource: Resource }) {
  const user = useAuthUser();
  const canEdit = user.role !== "EMPLOYEE";
  const [items, setItems] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [customers, setCustomers] = useState<RecordRow[]>([]);
  const [projects, setProjects] = useState<RecordRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [requestDetails, setRequestDetails] = useState<RecordRow>();
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      resource,
      page: String(page),
      pageSize: String(pageSize),
      search,
      sort,
      direction,
    });
    if (status) query.set("status", status);
    if (type) query.set("type", type);
    try {
      const result = await requestJson<PageResult>(`/api/crm?${query}`);
      setItems(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${resourceTitles[resource]} could not be loaded.`);
    } finally {
      setLoading(false);
    }
  }, [direction, page, resource, search, sort, status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!["projects", "tasks", "requests"].includes(resource)) return;
    Promise.all([
      requestJson<PageResult>("/api/crm?resource=customers&pageSize=100"),
      requestJson<PageResult>("/api/crm?resource=projects&pageSize=100"),
      requestJson<PageResult>("/api/crm?resource=users"),
    ]).then(([customerResult, projectResult, userResult]) => {
      setCustomers(customerResult.items ?? []);
      setProjects(projectResult.items ?? []);
      setUsers((userResult.items ?? []) as UserOption[]);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "CRM reference data could not be loaded.");
    });
  }, [resource]);

  const title = resourceTitles[resource];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const statusOptions = resource === "projects"
    ? options.projectStatus
    : resource === "tasks"
      ? options.taskStatus
      : resource === "requests"
        ? options.requestStatus
        : [];
  const sortOptions = resource === "customers" || resource === "projects"
    ? [["createdAt", "Created date"], ["name", "Name"]]
    : resource === "tasks"
      ? [["createdAt", "Created date"], ["dueAt", "Due date"]]
      : [["createdAt", "Created date"]];

  const columns = useMemo(() => {
    if (resource === "customers") return ["name", "email", "phone", "projects", "requests", "createdAt"];
    if (resource === "projects") return ["name", "customer", "status", "tasks", "createdAt"];
    if (resource === "tasks") return ["title", "project", "status", "assignedTo", "dueAt"];
    if (resource === "requests") return ["title", "type", "customer", "status", "assignedTo", "createdAt"];
    return ["type", "lead", "user", "createdAt"];
  }, [resource]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await requestJson<{ item?: RecordRow }>(`/api/crm?resource=${resource}`, {
        method: resource === "customers" && editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          ...(resource === "customers" && editingId ? { id: editingId } : {}),
          ...(resource === "projects" ? { status: form.status || undefined } : {}),
          ...(resource === "tasks" ? { status: form.status || undefined } : {}),
        }),
      });
      if (resource === "requests" && files.length > 0) {
        const requestId = saved.item?.id;
        if (!requestId) throw new Error("The request was created, but its attachment target was not returned.");
        for (const file of files) {
          await uploadFile(file, {
            requestId,
            category: "CLIENT_ATTACHMENT",
            tags: [],
          });
        }
      }
      setFiles([]);
      setEditingId("");
      setForm({});
      setPage(1);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The record could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: RecordRow, nextStatus: string) {
    const payload = { id: item.id, status: nextStatus };
    try {
      await requestJson(`/api/crm?resource=${resource}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status could not be updated.");
    }
  }

  async function openRequest(item: RecordRow) {
    try {
      const result = await requestJson<{ item?: RecordRow }>(
        `/api/crm?resource=requests&id=${encodeURIComponent(item.id)}`,
      );
      setRequestDetails(result.item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request details could not be loaded.");
    }
  }

  async function updateRequest(input: Record<string, unknown>) {
    if (!requestDetails) return;
    try {
      await requestJson(`/api/crm?resource=requests`, {
        method: "PATCH",
        body: JSON.stringify({ id: requestDetails.id, ...input }),
      });
      await openRequest(requestDetails);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request could not be updated.");
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    await updateRequest({ action: "comment", body: comment.trim() });
    setComment("");
  }

  async function uploadFile(
    file: File,
    metadata: { requestId?: string; category: string; tags: string[] },
  ) {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksumSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const initiated = await requestJson<{
      document?: { id: string };
      uploadUrl?: string;
      uploadHeaders?: Record<string, string>;
    }>("/api/documents", {
      method: "POST",
      body: JSON.stringify({
        action: "initiate",
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256,
        category: metadata.category,
        tags: metadata.tags,
        requestId: metadata.requestId,
      }),
    });
    if (!initiated.document?.id || !initiated.uploadUrl) {
      throw new Error("The upload service did not return a valid upload target.");
    }
    const upload = await fetch(initiated.uploadUrl, {
      method: "PUT",
      headers: initiated.uploadHeaders,
      body: file,
    });
    if (!upload.ok) throw new Error(`The file upload failed (${upload.status}).`);
    await requestJson("/api/documents", {
      method: "POST",
      body: JSON.stringify({ action: "complete", documentId: initiated.document.id }),
    });
  }

  function setField(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  const field = (name: string, label: string, required = false, typeName = "text") => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={typeName}
        required={required}
        value={form[name] ?? ""}
        onChange={(event) => setField(name, event.currentTarget.value)}
      />
    </label>
  );
  const select = (name: string, label: string, values: Array<{ value: string; label: string }>, required = false) => (
    <label key={name}>
      {label}
      <select
        name={name}
        required={required}
        value={form[name] ?? ""}
        onChange={(event) => setField(name, event.currentTarget.value)}
      >
        <option value="">Select…</option>
        {values.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <PageMeta title={`${title} | GIEMENS`} description={`Manage GIEMENS ${title.toLowerCase()}.`} />
      <section className="section lead-dashboard crm-workspace">
        <div className="container">
          <SectionHeading eyebrow="GIEMENS CRM" title={title} description={`Search, review and manage ${title.toLowerCase()}.`} />
          <p className="admin-breadcrumb"><Link to="/admin">Administration</Link> / <Link to="/admin/dashboard">Dashboard</Link> / {title}</p>
          {error && <p className="form-status form-status-error" role="alert">{error}</p>}

          <div className="crm-toolbar">
            <label>
              Search
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.currentTarget.value); }} placeholder={`Search ${title.toLowerCase()}`} />
            </label>
            {statusOptions.length > 0 && (
              <label>
                Status
                <select value={status} onChange={(event) => { setPage(1); setStatus(event.currentTarget.value); }}>
                  <option value="">All statuses</option>
                  {statusOptions.map((value) => <option value={value} key={value}>{display(value)}</option>)}
                </select>
              </label>
            )}
            {resource === "requests" && (
              <label>
                Request type
                <select value={type} onChange={(event) => { setPage(1); setType(event.currentTarget.value); }}>
                  <option value="">All request types</option>
                  {options.requestType.map((value) => <option value={value} key={value}>{display(value)}</option>)}
                </select>
              </label>
            )}
            <label>
              Sort by
              <select value={sort} onChange={(event) => setSort(event.currentTarget.value)}>
                {sortOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <button className="button button-outline" type="button" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")}>
              {direction === "asc" ? "Oldest first" : "Newest first"}
            </button>
          </div>

          {canEdit && resource !== "activities" && (
            <form className="contact-form crm-create-form" onSubmit={(event) => void submit(event)}>
              <h2 className="lead-panel-heading">{editingId ? "Edit customer" : `Create ${resource === "requests" ? "request" : resource.slice(0, -1)}`}</h2>
              <div className="crm-form-grid">
                {resource === "customers" && (
                  <>
                    {field("name", "Customer name", true)}
                    {field("email", "Email address", false, "email")}
                    {field("phone", "Phone number")}
                  </>
                )}
                {resource === "projects" && (
                  <>
                    {field("name", "Project name", true)}
                    {select("customerId", "Customer", customers.map((customer) => ({ value: customer.id, label: text(customer.name) })))}
                    {select("status", "Status", options.projectStatus.map((value) => ({ value, label: display(value) })))}
                    <label className="crm-wide-field">Description<textarea value={form.description ?? ""} maxLength={5000} onChange={(event) => setField("description", event.currentTarget.value)} /></label>
                  </>
                )}
                {resource === "tasks" && (
                  <>
                    {field("title", "Task title", true)}
                    {select("projectId", "Project", projects.map((project) => ({ value: project.id, label: text(project.name) })))}
                    {select("status", "Status", options.taskStatus.map((value) => ({ value, label: display(value) })))}
                    {select("assignedToId", "Assignee", users.map((entry) => ({ value: entry.id, label: entry.name })))}
                    {field("dueAt", "Due date", false, "date")}
                    <label className="crm-wide-field">Details<textarea value={form.details ?? ""} maxLength={5000} onChange={(event) => setField("details", event.currentTarget.value)} /></label>
                  </>
                )}
                {resource === "requests" && (
                  <>
                    {select("type", "Request type", options.requestType.map((value) => ({ value, label: display(value) })), true)}
                    {select("customerId", "Customer", customers.map((customer) => ({ value: customer.id, label: text(customer.name) })), true)}
                    {field("title", "Request title", true)}
                    <label className="crm-wide-field">Description<textarea required minLength={10} maxLength={5000} value={form.description ?? ""} onChange={(event) => setField("description", event.currentTarget.value)} /></label>
                    <label className="crm-wide-field">Attachments (PDF, DOCX, JPEG, PNG or WebP; up to 20 MB each)
                      <input type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp" onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} />
                    </label>
                  </>
                )}
              </div>
              <button className="button button-primary form-submit" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
              </button>
              {editingId && <button className="button button-outline" type="button" onClick={() => { setEditingId(""); setForm({}); }}>Cancel edit</button>}
            </form>
          )}

          <div className="crm-table-wrap" aria-live="polite">
            {loading ? <p>Loading records…</p> : items.length === 0 ? (
              <p className="lead-empty">No {title.toLowerCase()} found.</p>
            ) : (
              <table className="crm-table">
                <thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll(/([A-Z])/g, " $1")}</th>)}{(resource === "requests" || resource === "customers") && <th>Action</th>}</tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {columns.map((column) => {
                        const raw = item[column];
                        const related = raw && typeof raw === "object" ? raw as Record<string, unknown> : undefined;
                        const value = column === "customer" || column === "project" || column === "assignedTo" || column === "lead" || column === "user"
                          ? related?.name
                          : column === "tasks" || column === "projects" || column === "requests" ? (item._count as Record<string, unknown> | undefined)?.[column]
                            : column === "createdAt" || column === "dueAt" ? date(raw) : raw;
                        if (column === "status" && statusOptions.length) {
                          return (
                            <td key={column}>
                              <select aria-label={`${title} status`} value={text(raw)} disabled={!canEdit} onChange={(event) => void changeStatus(item, event.currentTarget.value)}>
                                {(resource === "projects" ? options.projectStatus : resource === "tasks" ? options.taskStatus : options.requestStatus).map((valueOption) => (
                                  <option key={valueOption} value={valueOption}>{display(valueOption)}</option>
                                ))}
                              </select>
                            </td>
                          );
                        }
                        return <td key={column}>{display(value)}</td>;
                      })}
                      {resource === "requests" && <td><button className="button button-outline crm-small-button" type="button" onClick={() => void openRequest(item)}>Details</button></td>}
                      {resource === "customers" && canEdit && <td><button className="button button-outline crm-small-button" type="button" onClick={() => { setEditingId(item.id); setForm({ name: text(item.name), email: text(item.email), phone: text(item.phone) }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="crm-pagination">
            <span>{total} records · Page {page} of {pageCount}</span>
            <div>
              <button className="button button-outline" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <button className="button button-outline" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>

          {requestDetails && (
            <section className="crm-request-detail" aria-labelledby="request-detail-heading">
              <h2 className="lead-panel-heading" id="request-detail-heading">{display(requestDetails.title)}</h2>
              <p>{display(requestDetails.description)}</p>
              <div className="crm-request-actions">
                {canEdit && (
                  <>
                    <label>Status
                      <select value={text(requestDetails.status)} onChange={(event) => void updateRequest({ status: event.currentTarget.value })}>
                        {options.requestStatus.map((value) => <option value={value} key={value}>{display(value)}</option>)}
                      </select>
                    </label>
                    {user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? (
                      <label>Assignee
                        <select value={text((requestDetails.assignedTo as Record<string, unknown> | undefined)?.id)} onChange={(event) => void updateRequest({ action: "assign", assignedToId: event.currentTarget.value || null })}>
                          <option value="">Unassigned</option>
                          {users.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                        </select>
                      </label>
                    ) : null}
                  </>
                )}
                <button className="button button-outline" type="button" onClick={() => setRequestDetails(undefined)}>Close</button>
              </div>
              <h3 className="lead-panel-heading">Comments</h3>
              <div className="crm-comments">
                {Array.isArray(requestDetails.comments) && requestDetails.comments.map((entry) => {
                  const record = entry as Record<string, unknown>;
                  const author = record.user as Record<string, unknown> | undefined;
                  return <article key={text(record.id)}><strong>{display(author?.name)}</strong><p>{display(record.body)}</p><small>{date(record.createdAt)}</small></article>;
                })}
              </div>
              <h3 className="lead-panel-heading">Attachments</h3>
              <div className="crm-attachments">
                {Array.isArray(requestDetails.documents) && requestDetails.documents.map((entry) => {
                  const association = entry as Record<string, unknown>;
                  const document = association.document as Record<string, unknown> | undefined;
                  if (!document || typeof document.id !== "string") return null;
                  return (
                    <article key={document.id}>
                      <span>{display(document.fileName)} · {display(document.category)} · {display(document.sizeBytes)} bytes</span>
                      <button className="button button-outline crm-small-button" type="button" onClick={() => void downloadDocument(document.id as string, setError)}>Download</button>
                    </article>
                  );
                })}
                {(!Array.isArray(requestDetails.documents) || requestDetails.documents.length === 0) && <p className="lead-empty">No attachments yet.</p>}
              </div>
              <form className="crm-comment-form" onSubmit={(event) => void addComment(event)}>
                <label htmlFor="request-comment">Add a comment</label>
                <textarea id="request-comment" value={comment} maxLength={5000} onChange={(event) => setComment(event.currentTarget.value)} />
                <button className="button button-primary" type="submit" disabled={!comment.trim()}>Add comment</button>
              </form>
            </section>
          )}
        </div>
      </section>
    </>
  );
}

async function downloadDocument(documentId: string, setError: (message: string) => void) {
  setError("");
  try {
    const result = await requestJson<{ downloadUrl?: string }>(
      `/api/documents?id=${encodeURIComponent(documentId)}`,
    );
    if (!result.downloadUrl) throw new Error("The document download link is unavailable.");
    window.location.assign(result.downloadUrl);
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "The document could not be downloaded.");
  }
}

export function DocumentsWorkspace() {
  const [items, setItems] = useState<RecordRow[]>([]);
  const [file, setFile] = useState<File>();
  const [category, setCategory] = useState("CLIENT_ATTACHMENT");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<{ items?: RecordRow[] }>("/api/documents");
      setItems(result.items ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Documents could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const checksumSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const initiated = await requestJson<{
        document?: { id: string };
        uploadUrl?: string;
        uploadHeaders?: Record<string, string>;
      }>("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          action: "initiate",
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksumSha256,
          category,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      if (!initiated.document?.id || !initiated.uploadUrl) {
        throw new Error("The upload service did not return a valid upload target.");
      }
      const upload = await fetch(initiated.uploadUrl, {
        method: "PUT",
        headers: initiated.uploadHeaders,
        body: file,
      });
      if (!upload.ok) throw new Error(`The file upload failed (${upload.status}).`);
      await requestJson("/api/documents", {
        method: "POST",
        body: JSON.stringify({ action: "complete", documentId: initiated.document.id }),
      });
      setFile(undefined);
      setTags("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageMeta title="Documents | GIEMENS" description="Upload and manage GIEMENS client documents." />
      <section className="section lead-dashboard crm-workspace">
        <div className="container">
          <SectionHeading eyebrow="GIEMENS CRM" title="Documents" description="Manage private client and project attachments." />
          <p className="admin-breadcrumb"><Link to="/admin">Administration</Link> / <Link to="/admin/dashboard">Dashboard</Link> / Documents</p>
          {error && <p className="form-status form-status-error" role="alert">{error}</p>}
          <form className="contact-form crm-create-form" onSubmit={(event) => void submit(event)}>
            <h2 className="lead-panel-heading">Upload a document</h2>
            <div className="crm-form-grid">
              <label>File (PDF, DOCX, JPEG, PNG or WebP; up to 20 MB)
                <input type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.currentTarget.files?.[0])} />
              </label>
              <label>Category
                <select value={category} onChange={(event) => setCategory(event.currentTarget.value)}>
                  {["CLIENT_ATTACHMENT", "LEGAL", "COMPLIANCE", "PROPERTY_VERIFICATION", "BUSINESS_REGISTRATION", "PROJECT"].map((item) => <option value={item} key={item}>{display(item)}</option>)}
                </select>
              </label>
              <label className="crm-wide-field">Tags (comma-separated)
                <input value={tags} maxLength={400} onChange={(event) => setTags(event.currentTarget.value)} placeholder="contract, client, 2026" />
              </label>
            </div>
            <button className="button button-primary form-submit" type="submit" disabled={!file || saving}>{saving ? "Uploading…" : "Upload document"}</button>
          </form>
          <h2 className="lead-panel-heading">Available documents</h2>
          {loading ? <p>Loading documents…</p> : items.length === 0 ? (
            <p className="lead-empty">No documents are available.</p>
          ) : (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead><tr><th>File</th><th>Category</th><th>Size</th><th>Tags</th><th>Uploaded</th><th>Action</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{display(item.fileName)}</td>
                      <td>{display(item.category)}</td>
                      <td>{display(item.sizeBytes)} bytes</td>
                      <td>{Array.isArray(item.tags) ? item.tags.map(display).join(", ") : "—"}</td>
                      <td>{date(item.createdAt)}</td>
                      <td><button className="button button-outline crm-small-button" type="button" onClick={() => void downloadDocument(item.id, setError)}>Download</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
