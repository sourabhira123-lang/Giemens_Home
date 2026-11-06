import nodemailer from "nodemailer";

export type SmtpProviderName =
  | "custom"
  | "microsoft365"
  | "google-workspace"
  | "zoho";

export type EmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

type MailTransport = ReturnType<typeof nodemailer.createTransport>;

export interface EmailProvider {
  readonly name: SmtpProviderName;
  send(message: EmailMessage): Promise<void>;
  verify(): Promise<void>;
}

const providerDefaults: Partial<
  Record<SmtpProviderName, { host: string; port: number }>
> = {
  microsoft365: { host: "smtp.office365.com", port: 587 },
  "google-workspace": { host: "smtp.gmail.com", port: 587 },
  zoho: { host: "smtp.zoho.com", port: 587 },
};

const retryableCodes = new Set([
  "ECONNECTION",
  "ECONNRESET",
  "EAI_AGAIN",
  "EPIPE",
  "ESOCKET",
  "ETIMEDOUT",
]);

function isRetryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; responseCode?: unknown };
  return (
    (typeof record.code === "string" && retryableCodes.has(record.code)) ||
    (typeof record.responseCode === "number" &&
      record.responseCode >= 400 &&
      record.responseCode < 500)
  );
}

export function resolveSmtpSettings(env: NodeJS.ProcessEnv) {
  const providerName = (env.SMTP_PROVIDER?.trim().toLowerCase() ||
    "custom") as SmtpProviderName;
  if (!["custom", "microsoft365", "google-workspace", "zoho"].includes(providerName)) {
    throw new Error("SMTP_PROVIDER must be custom, microsoft365, google-workspace or zoho.");
  }
  const provider = providerName as SmtpProviderName;
  const defaults = providerDefaults[provider];
  const host = env.SMTP_HOST?.trim() || defaults?.host;
  const port = env.SMTP_PORT?.trim()
    ? Number(env.SMTP_PORT)
    : defaults?.port ?? 587;
  if (!host || /[\s\r\n]/.test(host)) {
    throw new Error("SMTP_HOST is required for the selected SMTP_PROVIDER.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  if (!user || !password?.trim()) {
    throw new Error("SMTP_USER and SMTP_PASSWORD are required.");
  }
  return { provider, host, port, user, password };
}

export function createEmailProvider(
  env: NodeJS.ProcessEnv,
): EmailProvider {
  const settings = resolveSmtpSettings(env);
  const transport: MailTransport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    name: settings.provider,
    async send(message) {
      await transport.sendMail(message);
    },
    async verify() {
      await transport.verify();
    },
  };
}

export class EmailService {
  private readonly provider: EmailProvider;
  private readonly maxAttempts: number;

  constructor(provider: EmailProvider, maxAttempts = 3) {
    this.provider = provider;
    this.maxAttempts = maxAttempts;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
      throw new Error("Email retry attempts must be between 1 and 5.");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.provider.send(message);
        return;
      } catch (error) {
        if (attempt === this.maxAttempts || !isRetryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
      }
    }
  }
}

export class EmailHealthCheck {
  private readonly provider: EmailProvider;

  constructor(provider: EmailProvider) {
    this.provider = provider;
  }

  async check(): Promise<{ provider: SmtpProviderName; status: "healthy" }> {
    await this.provider.verify();
    return { provider: this.provider.name, status: "healthy" };
  }
}
