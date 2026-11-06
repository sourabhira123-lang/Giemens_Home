# Azure Container Apps deployment

The template deploys the Node.js container to Azure Container Apps, uses a
user-assigned identity to pull the image from an existing ACR, enables
Log Analytics, configures health probes, and stores runtime credentials as
Container App secrets. It provisions a private Blob container and grants the
app identity the Blob Data Contributor and Blob Delegator roles used for
short-lived user-delegation SAS URLs. PostgreSQL, Redis, SMTP, ACR, and the
Log Analytics workspace are provisioned separately.

The template sets `AZURE_CLIENT_ID` to the user-assigned identity so
`DefaultAzureCredential` selects the intended identity in Container Apps.

## Prerequisites

- Azure CLI logged into the intended subscription.
- A resource group, Log Analytics workspace and Azure Container Registry.
- A globally unique storage account name and the exact HTTPS site origin for
  Blob CORS configuration.
- A pushed, immutable app image.
- PostgreSQL with the active migrations applied, Upstash Redis, SMTP and
  approved application secrets.
- A private ClamAV daemon reachable from Container Apps. The app uses its
  configured host/port for malware scanning and includes it in `/ready`; never
  expose TCP 3310 to public networks.

Build and push the image using the repository's Dockerfile and `VITE_SITE_URL`
build argument. Do not pass runtime secrets as Docker build arguments.

Create a parameter file outside version control. The `databaseUrl`,
`authRateLimitSecret`, `metricsAuthToken`, `smtpUser`, `smtpPassword`, and
`redisRestToken` parameters are secure inputs. Set `clamavHost` to the private
daemon hostname and optionally set `otelExporterOtlpEndpoint` to the private
collector. Never commit a populated parameters file.

```powershell
az deployment group create `
  --resource-group <resource-group> `
  --template-file infra/azure/main.bicep `
  --parameters @infra/azure/production.parameters.json
```

The deployment identity needs permission to assign `AcrPull` on the registry.
After deployment, set up the custom domain and certificate, restrict the app's
database egress to the PostgreSQL server, and run migrations as a separate
release step before directing customer traffic.

The document API restricts files to PDF, DOCX, JPEG, PNG, and WebP under 20 MB.
Uploads use a short-lived write SAS, then the server verifies the uploaded
content length, content type, and SHA-256 checksum before marking metadata
ready. Download URLs are short-lived and force attachment disposition. The
container is private; never add public access.

The application keeps unscanned uploads inaccessible in `PENDING_UPLOAD`,
marks clean files `READY` only after ClamAV succeeds, and marks detected files
`REJECTED`. Schedule `npm run documents:cleanup` in a protected job using the
app's database and Blob identity. `READY` documents are not automatically
deleted; apply approved legal retention policies separately.
