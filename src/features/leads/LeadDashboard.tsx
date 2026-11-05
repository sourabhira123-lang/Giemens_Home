import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta, SectionHeading } from "../../components";
import { pageMeta } from "../../data";
import {
  formatLeadDate,
  getLeadMetrics,
  sortLeadsByCreatedAt,
} from "./leadManagement.ts";
import { leadStatuses, type Lead, type LeadStatus } from "./model.ts";

export function LeadDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "status">("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    let active = true;
    fetch("/api/leads", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          leads?: Lead[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.leads)) {
          throw new Error(result.error || "Lead records could not be loaded.");
        }
        if (!active) return;
        const sorted = sortLeadsByCreatedAt(result.leads);
        setLeads(sorted);
        setSelectedLeadId(sorted[0]?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Lead records could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => getLeadMetrics(leads), [leads]);
  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads
      .filter((lead) => !statusFilter || lead.status === statusFilter)
      .filter((lead) => !query || [lead.name, lead.email, lead.company, lead.subject]
        .some((value) => value?.toLowerCase().includes(query)))
      .sort((left, right) => {
        const comparison = sortBy === "name"
          ? left.name.localeCompare(right.name)
          : sortBy === "status"
            ? left.status.localeCompare(right.status)
            : left.createdAt.localeCompare(right.createdAt);
        return direction === "asc" ? comparison : -comparison;
      });
  }, [direction, leads, search, sortBy, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const visibleLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId);

  useEffect(() => {
    if (selectedLeadId && !filteredLeads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0]?.id ?? "");
    }
  }, [filteredLeads, selectedLeadId]);

  async function updateLeadStatus(id: string, status: LeadStatus) {
    setError("");
    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = (await response.json()) as {
        lead?: Lead;
        error?: string;
      };
      if (!response.ok || !result.lead) {
        throw new Error(result.error || "Lead status could not be updated.");
      }
      const updatedLead = result.lead;
      setLeads((current) =>
        sortLeadsByCreatedAt(
          current.map((lead) => (lead.id === id ? updatedLead : lead)),
        ),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Lead status could not be updated.",
      );
    }
  }

  return (
    <>
      <PageMeta {...pageMeta["/admin/leads"]} />
      <section className="section lead-dashboard">
        <div className="container">
          <SectionHeading
            eyebrow="Lead management"
            title="Website inquiries"
            description="Review and manage website inquiries."
          />
          <p className="admin-breadcrumb"><Link to="/admin">Administration</Link> / Lead management</p>
          {error && <p className="form-status form-status-error" role="alert">{error}</p>}
          <div className="crm-toolbar">
            <label>
              Search
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.currentTarget.value); }} placeholder="Search leads" />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.currentTarget.value); }}>
                <option value="">All statuses</option>
                {leadStatuses.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
              </select>
            </label>
            <label>
              Sort by
              <select value={sortBy} onChange={(event) => setSortBy(event.currentTarget.value as typeof sortBy)}>
                <option value="createdAt">Created date</option>
                <option value="name">Name</option>
                <option value="status">Status</option>
              </select>
            </label>
            <button className="button button-outline" type="button" onClick={() => setDirection((value) => value === "asc" ? "desc" : "asc")}>
              {direction === "asc" ? "Ascending" : "Descending"}
            </button>
          </div>
          {loading ? (
            <p aria-live="polite">Loading lead records…</p>
          ) : (
            <>
              <div className="benefit-grid lead-metrics">
                {[
                  { label: "Total Leads", value: metrics.total },
                  { label: "New Leads", value: metrics.new },
                  { label: "Qualified Leads", value: metrics.qualified },
                ].map((metric) => (
                  <article className="benefit-card" key={metric.label}>
                    <span className="benefit-number">{String(metric.value).padStart(2, "0")}</span>
                    <h3>{metric.label}</h3>
                  </article>
                ))}
              </div>
              <div className="lead-dashboard-grid">
                <section aria-labelledby="recent-leads-heading">
                  <h2 className="lead-panel-heading" id="recent-leads-heading">Recent Leads</h2>
                  {visibleLeads.length === 0 ? (
                    <p className="lead-empty">No inquiries match these filters.</p>
                  ) : (
                    <div className="lead-list">
                      {visibleLeads.map((lead) => (
                        <button
                          className={`lead-list-item${lead.id === selectedLeadId ? " lead-list-item-selected" : ""}`}
                          key={lead.id}
                          type="button"
                          onClick={() => setSelectedLeadId(lead.id)}
                        >
                          <span>
                            <strong>{lead.name}</strong>
                            <small>{lead.businessDivision} · {formatLeadDate(lead.createdAt)}</small>
                          </span>
                          <span className="lead-status-label">{lead.status.replaceAll("_", " ")}</span>
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="crm-pagination">
                    <span>{filteredLeads.length} leads · Page {page} of {pageCount}</span>
                    <div>
                      <button className="button button-outline" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                      <button className="button button-outline" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
                    </div>
                  </div>
                </section>
                <section aria-labelledby="lead-details-heading">
                  <h2 className="lead-panel-heading" id="lead-details-heading">Lead Details</h2>
                  {selectedLead ? (
                    <div className="lead-details">
                      <dl>
                        <div><dt>Name</dt><dd>{selectedLead.name}</dd></div>
                        <div><dt>Email</dt><dd><a href={`mailto:${selectedLead.email}`}>{selectedLead.email}</a></dd></div>
                        <div><dt>Phone</dt><dd>{selectedLead.phone || "Not provided"}</dd></div>
                        <div><dt>Company</dt><dd>{selectedLead.company || "Not provided"}</dd></div>
                        <div><dt>Business Division</dt><dd>{selectedLead.businessDivision}</dd></div>
                        <div><dt>Source</dt><dd>{selectedLead.source}</dd></div>
                        <div><dt>Subject</dt><dd>{selectedLead.subject}</dd></div>
                        <div><dt>Created</dt><dd>{formatLeadDate(selectedLead.createdAt)}</dd></div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            <select
                              aria-label="Lead status"
                              value={selectedLead.status}
                              onChange={(event) =>
                                void updateLeadStatus(
                                  selectedLead.id,
                                  event.currentTarget.value as LeadStatus,
                                )
                              }
                            >
                              {leadStatuses.map((status) => (
                                <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                              ))}
                            </select>
                          </dd>
                        </div>
                      </dl>
                      <div className="lead-message">
                        <strong>Message</strong>
                        <p>{selectedLead.message}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="lead-empty">Select an inquiry to view its details.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
