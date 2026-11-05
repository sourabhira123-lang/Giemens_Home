import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { PageMeta, SectionHeading } from "../../components";
import type { AuthRole } from "../../../server/auth.ts";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
};

type SessionResponse = {
  authenticated?: boolean;
  user?: AuthUser;
  error?: string;
};

const leadAccessRoles: AuthRole[] = ["SUPER_ADMIN", "ADMIN"];

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.name === "string" &&
    typeof user.role === "string" &&
    ["SUPER_ADMIN", "ADMIN", "MANAGER", "EMPLOYEE"].includes(user.role)
  );
}

export function ProtectedRoute({
  allowedRoles,
}: {
  allowedRoles?: AuthRole[];
}) {
  const location = useLocation();
  const [user, setUser] = useState<AuthUser>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as SessionResponse;
        if (!response.ok) throw new Error(result.error || "Session validation failed.");
        if (!active) return;
        if (result.authenticated && isAuthUser(result.user)) {
          setUser(result.user);
        } else {
          setUser(undefined);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (active) {
          setUser(undefined);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);

  if (status === "loading") {
    return (
      <section className="section auth-section" aria-live="polite">
        <div className="container"><p>Checking your session…</p></div>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="section auth-section">
        <div className="container">
          <p className="form-status form-status-error" role="alert">
            Authentication is temporarily unavailable. Please try again.
          </p>
          <button className="button button-outline" type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      </section>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <section className="section auth-section">
        <div className="container">
          <PageMeta title="Access denied | GIEMENS" description="Your account does not have access to this page." />
          <span className="eyebrow">Access restricted</span>
          <h1>Access denied</h1>
          <p>Your account does not have permission to access this page.</p>
          <Link className="button button-outline" to="/admin">Return to administration</Link>
        </div>
      </section>
    );
  }

  return <Outlet context={user} />;
}

export function useAuthUser(): AuthUser {
  return useOutletContext<AuthUser>();
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json().catch(() => undefined)) as
        | SessionResponse
        | undefined;
      if (!response.ok || !result?.authenticated || !isAuthUser(result.user)) {
        setError(result?.error || "Email or password is incorrect.");
        return;
      }

      const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
      const safeReturnTo =
        typeof returnTo === "string" &&
        /^\/admin(?:\/(?:dashboard|leads|customers|projects|tasks|requests|activities|documents))?$/.test(returnTo)
          ? returnTo
          : "/admin";
      navigate(safeReturnTo, { replace: true });
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageMeta
        title="Sign in | GIEMENS"
        description="Sign in to the GIEMENS administration portal."
      />
      <section className="section auth-section">
        <div className="container auth-container">
          <SectionHeading
            eyebrow="GIEMENS administration"
            title="Sign in"
            description="Use your assigned GIEMENS account to continue."
          />
          <form className="contact-form auth-form" onSubmit={handleSubmit}>
            <label>
              Email address
              <input
                autoComplete="username"
                autoCapitalize="none"
                type="email"
                name="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                name="password"
                required
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
            </label>
            {error && <p className="form-status form-status-error" role="alert">{error}</p>}
            <button className="button button-primary form-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <p>Forgot your password? Contact your system administrator. Self-service reset is not available yet.</p>
          </form>
        </div>
      </section>
    </>
  );
}

export function AdminHome() {
  const user = useAuthUser();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const canManageLeads = leadAccessRoles.includes(user.role);
  const workspaceLinks = [
    { label: "Dashboard", to: "/admin/dashboard" },
    ...(canManageLeads ? [{ label: "Lead management", to: "/admin/leads" }] : []),
    { label: "Customers", to: "/admin/customers" },
    { label: "Projects", to: "/admin/projects" },
    { label: "Tasks", to: "/admin/tasks" },
    { label: "Jurivana requests", to: "/admin/requests" },
    ...(leadAccessRoles.includes(user.role) ? [{ label: "Activities", to: "/admin/activities" }] : []),
    { label: "Documents", to: "/admin/documents" },
  ];

  async function signOut() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Sign-out failed.");
      navigate("/login", { replace: true });
    } catch {
      setError("Sign-out is temporarily unavailable. Please try again.");
    }
  }

  return (
    <>
      <PageMeta title="Administration | GIEMENS" description="GIEMENS administration portal." />
      <section className="section auth-section">
        <div className="container">
          <SectionHeading
            eyebrow="GIEMENS administration"
            title="Administration"
            description={`Signed in as ${user.name} · ${user.role.replaceAll("_", " ")}`}
          />
          <div className="auth-actions">
            {workspaceLinks.map((item) => (
              <Link className="button button-primary" to={item.to} key={item.to}>{item.label}</Link>
            ))}
            <button className="button button-outline" type="button" onClick={signOut}>Sign out</button>
          </div>
          {error && <p className="form-status form-status-error" role="alert">{error}</p>}
        </div>
      </section>
    </>
  );
}
