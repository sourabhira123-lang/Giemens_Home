import { createEmailProvider, EmailHealthCheck } from "../server/email-service.ts";
import { logEvent } from "../server/observability.ts";

async function main(): Promise<void> {
  const provider = createEmailProvider(process.env);
  const result = await new EmailHealthCheck(provider).check();
  logEvent("info", "email.health_check.passed", result);
}

main().catch((error: unknown) => {
  logEvent("error", "email.health_check.failed", {
    error: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
});
