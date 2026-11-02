# GIEMENS Enterprise Operating System

## 1. Scope and architecture decisions

This document defines a target architecture and an implementation blueprint. It
does not migrate or replace the current website, create a working CRM service,
or provision Azure resources.

The current repository is a Vite/React corporate website with a Vercel contact
API. Keep that production surface unchanged while the platform is designed and
built as isolated applications and services. A later, separately approved
website migration can move its routes and content to Next.js 15 without
changing the public URLs or GIEMENS design system.

Use the existing local PostgreSQL 18 instance shown in pgAdmin
(`127.0.0.1:5432`, database `giemens`, login `postgres`). Do not provision a
second PostgreSQL server or database. Before the first migration, confirm
network access, backup/PITR coverage, connection limits, and least-privilege
credentials with the database owner. Isolate CRM objects in the `giemens_crm`
schema, and do not alter or drop unrelated schemas or objects.

### System context

```text
Customers / Employees
        |
 Azure Front Door + WAF
        |
   Web applications (Next.js 15)
   ├── Public website (migration target)
   ├── CRM
   ├── Admin / CEO dashboard
   └── Auth.js BFF (sessions, CSRF, user-facing API)
        |
 Azure API Management (versioned service APIs)
   ├── CRM service (FastAPI)
   ├── Document service (FastAPI)
   ├── Notification service (FastAPI)
   └── Agent service (FastAPI + Semantic Kernel)
        |
 Existing PostgreSQL instance/database + private networking
 ├── CRM and operational data
 ├── tenant isolation (RLS)
 └── transactional outbox
        |
 Azure Service Bus --> n8n workflows / workers / agent orchestration
        |
 Azure Blob Storage | Azure OpenAI | Microsoft Entra ID
```

### Important ORM boundary

Prisma is a TypeScript ORM and is not a native FastAPI ORM. Avoid giving both
Prisma and SQLAlchemy ownership of database migrations. In this target design:

- `database/prisma/schema.prisma` is the canonical schema and migration source.
- A controlled Node.js migration job runs `prisma migrate deploy` in CI/CD.
- FastAPI services use SQLAlchemy 2.x for typed queries and transactions, with
  SQLAlchemy models mapped to the Prisma-managed PostgreSQL schema.
- Alembic is not enabled for these same tables. If the organization later
  chooses Alembic as migration owner, retire Prisma migrations before changing
  ownership.
- Prisma Client is used only by TypeScript applications that are explicitly
  authorized to access PostgreSQL. Prefer service APIs over direct UI-to-
  database access.

The Prisma schema is an implementation starting point, not a substitute for
review of jurisdictional privacy, retention, records, and legal requirements.

## 2. Domain and service boundaries

Model each business as a domain/brand attached to a tenant organization.
`business_unit` on a lead is an assignment/routing label, not a security
boundary. Tenant isolation is determined by the authenticated organization
membership and `organization_id`.

| Bounded context | Owns | Initial implementation |
| --- | --- | --- |
| Identity and access | Users, memberships, roles, permissions, sessions | Entra ID + Auth.js; CRM authorization checks |
| Customer relationship | Leads, contacts, customers, activities | CRM service |
| Delivery | Projects, tasks, business ownership and assignments | CRM service |
| Documents | Metadata, access policy, storage references | Document service + private Blob containers |
| Communications | Notifications and delivery status | Notification service |
| AI and automation | Agent runs/logs, routing decisions, approvals | Agent service + Service Bus + n8n |
| Corporate operations | Finance, HR, procurement, inventory, billing | ERP bounded contexts, introduced after CRM |
| Analytics | Read-optimized KPIs and department performance | Event-fed reporting store; no heavy OLTP queries |

Use stable identifiers and explicit contracts between contexts. Do not make
Jurivana-specific records or rules part of shared generic tables unless the
concept is truly enterprise-wide. Jurivana workflows can extend the shared
CRM through separately versioned domain services and tables.

## 3. Database design

### Tenancy, authorization, and lifecycle

- Every tenant-owned record has a non-null `organization_id`; customer-visible
  records additionally have an owning `business_unit`.
- `organization_memberships` binds an identity to an organization and role.
  Never trust organization IDs submitted by the browser; derive the tenant
  context from the validated session and membership.
- Permissions are explicit records. Roles collect permissions; authorization
  checks use both tenant membership and permission, not role-name comparisons.
- PostgreSQL row-level security (RLS) is defense in depth. Set
  `app.tenant_id` transaction-locally after validating membership, and enforce
  RLS on every tenant table. The application database role must not own tables
  or have `BYPASSRLS`.
- `deleted_at` is for recoverable soft deletion, not a universal substitute
  for retention policy. Sensitive audit events are append-only and must not be
  soft-deleted.
- Partial unique indexes for active records (for example an active lead's
  external reference) are installed in SQL migrations because Prisma schema
  syntax does not express every partial-index policy.
- Store document bytes only in private Blob Storage. PostgreSQL stores
  metadata, tenant ownership, classification, checksums, and object keys.
- Use UTC timestamps, UUID identifiers, bounded text fields, database
  constraints, and explicit status enums. Encrypt secrets and sensitive
  integration credentials in Key Vault, never in these business tables.

### Initial CRM entities

```text
organizations 1---* organization_memberships *---1 users
roles 1---* role_permissions *---1 permissions
organizations 1---* leads
organizations 1---* contacts
organizations 1---* customers
organizations 1---* projects 1---* tasks
organizations 1---* documents
organizations 1---* activities
organizations 1---* notifications
organizations 1---* agent_logs
organizations 1---* audit_logs
```

Lead conversion should be a single transaction that records the conversion
activity and creates or links customer/contact records. Preserve the lead as
the source record rather than deleting it.

## 4. Prisma schema

The executable initial schema is [database/prisma/schema.prisma](../database/prisma/schema.prisma).
It includes the required identity, organization, CRM, delivery, document,
activity, notification, agent, and audit models, plus memberships, role
permissions, and an outbox for secure tenant-aware operation.

Before production, add reviewed SQL migrations for RLS policies, partial
indexes, append-only audit enforcement, and any database-level composite
tenant foreign-key constraints not represented by the ORM schema. Run the
schema against the dedicated local PostgreSQL instance and generate Prisma
Client before accepting application work against it.

## 5. API architecture

Expose versioned APIs through Azure API Management. The Next.js applications
call their BFF; the BFF calls internal service APIs using managed identity.
Services are not exposed directly to the public internet.

| Method and route | Service | Purpose |
| --- | --- | --- |
| `POST /api/v1/leads` | CRM | Validate and create a lead; supports idempotency |
| `GET /api/v1/leads` | CRM | Tenant-scoped, permission-checked search and pagination |
| `GET /api/v1/leads/{lead_id}` | CRM | Read a lead and permitted activity summary |
| `PATCH /api/v1/leads/{lead_id}` | CRM | Update permitted fields with optimistic concurrency |
| `POST /api/v1/leads/{lead_id}/convert` | CRM | Convert lead to customer/contact idempotently |
| `GET/POST /api/v1/customers` | CRM | Customer management |
| `GET/POST /api/v1/projects` | CRM | Project management |
| `GET/POST /api/v1/projects/{project_id}/tasks` | CRM | Task management |
| `POST /api/v1/documents/upload-intents` | Documents | Authorize upload and issue short-lived SAS URL |
| `POST /api/v1/ai/intake` | Agent | Classify inquiry and return routing proposal |
| `POST /api/v1/agent-runs/{run_id}/approve` | Agent | Human approval for consequential actions |

Contracts:

- OpenAPI is generated from FastAPI and versioned with each service.
- Require Entra ID authentication, tenant membership, permission checks, input
  validation, request-size limits, correlation IDs, and structured errors.
- Use opaque UUIDs, bounded cursor pagination, field allowlists, and
  optimistic concurrency (`version`/ETag) for mutable CRM records.
- `Idempotency-Key` is required for public lead intake and conversion. Store
  idempotency state transactionally with the operation.
- Write the business change and outbox event in one database transaction.
  Publish events asynchronously; consumers must be idempotent.
- Protect public inquiry endpoints with abuse controls, bot detection, rate
  limits, and minimal PII collection. Do not expose CRM search publicly.
- Use short-lived, scoped Blob SAS URLs; scan uploads before making them
  available to users or AI.

## 6. Folder architecture

```text
apps/
  website/                  # Existing Vite site until separately approved migration
  crm/                      # Next.js 15 CRM; Auth.js BFF; approved design system
  admin/                    # Next.js 15 admin and executive dashboard
services/
  crm-service/              # FastAPI customer, lead, project, task APIs
  document-service/         # FastAPI metadata, scanning, Blob access
  notification-service/     # FastAPI notification dispatch and delivery state
  agent-service/            # FastAPI orchestration, Semantic Kernel, approvals
packages/
  ui/                       # Shared tokens/components; keep GIEMENS design system
  contracts/                # OpenAPI-generated and event contract types
  auth/                     # Shared claims and authorization contract, not secrets
database/
  prisma/                   # Canonical schema, migrations, seeds
  policies/                 # Reviewed PostgreSQL RLS and integrity SQL
agents/
  jurivana/
  technology/
  engineering/
  commerce/
  consulting/
  academy/
  corporate/
  shared/                   # Tool contracts, policies, evaluation harness
workflows/
  n8n/                      # Versioned workflow exports; credentials excluded
infra/
  bicep/                    # Azure infrastructure modules and environments
  policies/
  dashboards/
.github/workflows/          # CI and protected deployment workflows
```

Use a workspace/monorepo only when shared CI and package ownership are
established. Each service still has a clear deployable boundary, ownership,
health checks, contract tests, and versioned configuration. Never migrate the
current website by moving its files into this structure without a separate
review and route/SEO regression plan.

## 7. CRM modules

1. **Lead management:** intake, source, business-unit classification,
   qualification, assignment, consent, lifecycle, conversion, duplicate
   handling, and service-level reminders.
2. **Customer management:** organization/person profiles, contacts, verified
   communication channels, preferences, relationships, and retention controls.
3. **Project management:** customer-linked delivery projects, ownership,
   milestones, status, budget references, and business unit.
4. **Task management:** project-linked tasks, assignees, due dates, priorities,
   dependencies, and change history.
5. **Document management:** metadata, access control, malware status, version,
   classification, legal hold/retention, and Blob object lifecycle.
6. **Communication management:** message metadata and delivery state;
   message contents remain subject to consent, retention, and access policies.
7. **Activity tracking:** append-oriented interaction timeline with actor,
   target, source, timestamp, and correlation ID.
8. **Agent management:** run state, tool calls, policy/evaluation result,
   approval state, model/deployment ID, and token/cost telemetry. Never store
   chain-of-thought or credentials in logs.

Start Sprint 1 with authenticated lead intake, tenant-scoped CRUD, RBAC,
activity/audit records, deduplication, and outbox publication. Defer broad
project/ERP functionality until lead workflows and tenant controls are proven.

## 8. ERP foundation

Do not treat the CRM as a full ERP. Establish future bounded contexts and
shared controls early:

- Finance: chart of accounts, invoices, payments, tax configuration, expenses,
  period close, and reconciliations.
- Procurement: vendors, purchase requests/orders, approvals, and receiving.
- People: workforce directory, roles, onboarding, leave, and payroll-provider
  integrations (payroll data requires a distinct high-sensitivity boundary).
- Operations: service catalog, engagements, delivery plans, capacity, and
  quality/compliance controls.
- Shared foundations: legal entities, currencies, time zones, approval
  policies, immutable accounting events, integration IDs, and reporting dates.

Financial postings are append-only, balanced ledger entries; never use mutable
CRM revenue fields as a source of accounting truth. Integrate with a
jurisdiction-appropriate accounting system before building a general ledger.

## 9. AI agent architecture

```text
Channel -> intake API -> schema validation + consent
        -> intent classifier -> confidence/policy gate
        -> department routing proposal -> CRM lead transaction
        -> notification/outbox -> assigned human
        -> approved tools (when permitted) -> agent log/evaluation
```

### Routing taxonomy

| Intent examples | Proposed business unit |
| --- | --- |
| GST registration, property verification, compliance | Jurivana |
| Website development, cloud, enterprise software | Technology |
| Engineering consultancy, infrastructure, project services | Engineering |
| Digital marketing, e-commerce, marketplace, brand growth | Commerce |
| Startup, business process, strategy consulting | Consulting |
| Professional training, certification, corporate learning | Academy |

Use deterministic rules for high-confidence known intents and Azure OpenAI for
ambiguous language, with a constrained JSON output schema. Treat model output
as untrusted data. Below a measured confidence threshold, ask a clarifying
question or send to a human queue. Create the lead before notifications; agent
failure must not lose the inquiry. Never let a model autonomously provide
legal advice, approve a transaction, send a binding proposal, or change
compliance records without explicit policy and human approval.

Agents are versioned, least-privileged workers with allowlisted tools, bounded
execution time, token budgets, prompt-injection defenses, PII minimization,
content filtering, audit events, offline evaluations, and kill switches.
Azure OpenAI is accessed only from the agent service via managed identity.
Store model/deployment and policy versions, not hidden reasoning.

Initial agents: Jurivana Legal Assistant, Compliance Assistant, Property
Verification Agent, Agreement Generator, Filing Reminder Agent; Technology
Lead Qualification Agent, Proposal Generator, Requirement Analyzer,
Development Assistant, Customer Success Agent; Engineering Cost Estimator,
BOQ Assistant, Vendor Management Agent, Project Monitoring Agent; Corporate
Finance, HR, Recruitment, Operations agents, and CEO Copilot. Keep each agent's
permissions and grounding sources specific to its domain.

## 10. n8n integration layer

Use n8n for cross-system orchestration, not as the authoritative CRM database
or authorization layer.

- Trigger workflows from signed Service Bus messages/webhooks and validate
  schema, tenant, event ID, and source.
- Prefer a transactional outbox -> dispatcher -> Service Bus -> n8n pattern.
- Use managed/self-hosted n8n in a private Azure network for regulated or
  sensitive workflows; evaluate data residency and license requirements.
- Store credentials in Key Vault-backed integrations; never include secrets
  in exported workflow JSON or source control.
- Require idempotent consumers, bounded retries, dead-letter queues,
  replay-safe workflows, timeouts, alerting, and execution retention limits.
- Keep high-risk state transitions in CRM/domain services. n8n calls service
  APIs with workload identity and cannot write directly to PostgreSQL.
- First workflows: lead notification, assignment/SLA reminder, approved
  document request, and opt-in email/WhatsApp delivery.

## 11. Azure deployment architecture

Recommended production baseline:

- **Edge:** Azure Front Door Premium with WAF, TLS, managed certificates,
  bot/rate controls, and path-based routing.
- **Identity:** Microsoft Entra ID workforce tenant; Auth.js OIDC for
  application sessions; MFA/conditional access for staff; separate customer
  identity strategy if a client portal is introduced.
- **Compute:** Azure Container Apps for FastAPI services and workers; deploy
  Next.js on Azure Container Apps or Azure Static Web Apps only after runtime
  feature validation. Do not expose service ingress publicly.
- **API:** Azure API Management for service authentication, quotas, versioning,
  and OpenAPI publication.
- **Data:** Reuse the existing PostgreSQL deployment and database. Confirm
  private access, encryption, backup/PITR, maintenance, capacity, and restore
  support on that deployment; do not create a replacement server as part of
  CRM rollout. If the existing service cannot meet an agreed production
  requirement, document and approve a separate migration before provisioning
  anything.
- **Messaging:** Azure Service Bus queues/topics, dead-letter queues, and
  managed identity.
- **Files:** private Azure Blob Storage, malware scanning/quarantine, lifecycle
  rules, versioning, encryption, and short-lived scoped SAS.
- **AI:** Azure OpenAI deployments with private networking where available,
  content-safety controls, quotas, and managed identity.
- **Secrets:** Azure Key Vault, managed identities, rotation, and no secret
  values in build logs or client bundles.
- **Operations:** Azure Monitor, Application Insights, Log Analytics, OpenTelemetry,
  distributed trace IDs, service-level alerts, and privacy-aware retention.
- **Network:** hub-spoke VNets, private endpoints, private DNS, controlled
  egress, and separate production/non-production subscriptions.

Define recovery objectives with business owners. Set RPO/RTO per service,
exercise point-in-time recovery and regional recovery, and document degraded
mode for CRM intake and notifications before launch.

## 12. CI/CD and environment architecture

GitHub Actions with protected GitHub Environments:

1. Pull request: formatting, lint, type checks, unit/integration tests,
   OpenAPI compatibility, Prisma schema validation, generated-client check,
   dependency/license scanning, secret scanning, container/IaC scanning.
2. Build immutable, signed container/image artifacts; produce SBOM and
   provenance. Do not inject production secrets during build.
3. Deploy to isolated development environment; run migrations as a one-shot
   identity with narrowly scoped privileges; health, smoke, and tenant-isolation
   tests.
4. Promote the same artifacts to staging; run end-to-end, DAST, load, restore,
   and AI evaluation tests.
5. Production requires protected environment approval, change record, staged
   rollout/canary, and automated health gates.
6. Database migrations must be backward-compatible expand/migrate/contract:
   add nullable/additive structures, backfill, deploy readers/writers, then
   remove obsolete columns in a later release.

Use separate Azure subscriptions or strongly isolated resource groups,
databases, Entra app registrations, and Key Vaults per environment. No
production PII in development; use synthetic or irreversibly anonymized data.
Define rollback for application images and forward-fix strategy for
irreversible schema migrations.

## 13. Multi-year scalability strategy

### Year 1: secure CRM and ecosystem intake

Deliver tenant isolation, RBAC, leads/customers, basic projects/tasks,
activity/audit, document metadata/storage, API contracts, operational
dashboards, and the AI receptionist as a human-supervised routing assistant.
Prove backup/restore and security controls before portal rollout.

### Year 2: business workflows and customer portal

Add Jurivana workflow modules, customer portal, notification channels,
integrations, approvals, agent monitoring, service-level reporting, and
department-specific CRM experiences. Keep common identity, tenancy, and
audit controls centralized.

### Year 3: ERP and analytics

Introduce finance/procurement/people integrations or bounded services,
governed enterprise reporting, data quality, lineage, and business
intelligence. Separate analytical workloads from PostgreSQL OLTP using
event-fed reporting storage.

### Years 4-5: scale and ecosystem platform

Adopt service extraction only where measured load, ownership, or compliance
requires it; introduce regional data placement when regulation/business
demands it; provide partner APIs with quotas and tenant-safe authorization;
continuously evaluate AI quality, model cost, and operational risk.

### Scale triggers and SLOs

Set and measure availability, latency, error budget, lead-intake durability,
database saturation, queue age, document scan delay, and per-tenant usage
before adding infrastructure. Partition/archive only after measured volume and
retention requirements justify it. Use read replicas and caching for
read-heavy workloads; never bypass authorization or tenant context to improve
performance.

## 14. Delivery sequence and acceptance gates

| Sprint | Outcome | Gate before expansion |
| --- | --- | --- |
| 1 | Ecosystem route plan, PostgreSQL, Prisma migration baseline, lead API | RLS isolation tests, RBAC tests, audit/outbox atomicity, restore drill |
| 2 | CRM dashboard, customer, project, task, activity modules | Concurrency, access-control, and tenant-boundary tests |
| 3 | AI receptionist, qualification, WhatsApp/email integrations | Human fallback, consent, abuse testing, idempotency, evaluation baseline |
| 4 | Jurivana client portal and legal/property/compliance workflows | Privacy/legal review, document controls, approval trails |
| 5 | CEO dashboard, analytics, agent monitoring, BI | Metric definitions, source lineage, access controls, load validation |

The existing website remains the source of truth for public routes until a
separate Next.js migration is approved. Preserve paths, metadata, accessibility,
design tokens, card hover behavior, and visual regression baselines during any
future migration.
