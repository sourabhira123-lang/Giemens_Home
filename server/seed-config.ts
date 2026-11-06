export type AdminSeedConfig = {
  email: string;
  name: string;
  password: string;
};

export function readAdminSeedConfig(env: NodeJS.ProcessEnv): AdminSeedConfig {
  const email = (env.ADMIN_EMAIL ?? "admin@giemens.local").trim().toLowerCase();
  const name = (env.ADMIN_NAME ?? "GIEMENS Local Admin").trim();
  const password = env.ADMIN_PASSWORD ?? "";
  const passwordBytes = Buffer.byteLength(password, "utf8");

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (!name || name.length > 120) {
    throw new Error("ADMIN_NAME must be between 1 and 120 characters.");
  }
  if (
    passwordBytes < 12 ||
    passwordBytes > 128 ||
    !password.trim() ||
    password === email ||
    /^(?:password|admin|changeme|replace[-_ ]?me)/i.test(password)
  ) {
    throw new Error("Set ADMIN_PASSWORD to a unique password between 12 and 128 UTF-8 bytes.");
  }
  return { email, name, password };
}
