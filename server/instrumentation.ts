import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { logEvent } from "./observability.ts";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
let sdk: NodeSDK | undefined;

if (endpoint) {
  const baseUrl = new URL(endpoint);
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error("OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP(S) URL without embedded credentials.");
  }
  const base = endpoint.replace(/\/+$/, "");
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "jurivana",
      "service.version": process.env.npm_package_version ?? "unknown",
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || `${base}/v1/traces`,
    }),
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() || `${base}/v1/metrics`,
      }),
      exportIntervalMillis: 60_000,
    })],
    instrumentations: [new HttpInstrumentation(), new PrismaInstrumentation()],
  });
  await sdk.start();
  logEvent("info", "telemetry.started", { exporter: "otlp" });
}

let shutdownStarted = false;
async function shutdownTelemetry(): Promise<void> {
  if (!sdk || shutdownStarted) return;
  shutdownStarted = true;
  try {
    await sdk.shutdown();
  } catch (error) {
    logEvent("error", "telemetry.shutdown.failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => void shutdownTelemetry());
process.once("SIGINT", () => void shutdownTelemetry());
