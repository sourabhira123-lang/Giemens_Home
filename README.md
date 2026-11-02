# GIEMENS Corporate Website

## Local development

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

For the local CRM database, the existing PostgreSQL 18 instance is configured
in pgAdmin at `127.0.0.1:5432`, with the existing `giemens` database and
`postgres` login. Set `DATABASE_URL` in the ignored local `.env` file to that
database, replacing `YOUR_LOCAL_PASSWORD` locally. Never commit `.env` or paste
database credentials into chat. CRM migrations are scoped to the
`giemens_crm` schema and must not modify the existing `public` schema.

`npm run dev` starts the Vite website. To run the Vercel serverless contact
function locally, copy `.env.example` to `.env.local`, add the required
development credentials below, then run `npx vercel dev`. Opening the site with
`npm run dev` alone serves only the frontend; Vite does not execute the
serverless `/api/contact` function. Vercel CLI may ask you to authenticate or
link the project. Do not enter production secrets into a public or shared
environment.

## GitHub push on commit

This workspace is configured to push the current branch to `origin` after each
Git commit. To enable the same behavior in another clone, run:

```bash
git config core.hooksPath .githooks
```

Changes must still be committed explicitly; saving a file does not create or
push a commit. GitHub authentication must be configured for pushes to succeed.

## Environment variables

Configure these in the Vercel project settings for Preview and Production.
Values in the browser must use the `VITE_` prefix; never put API keys in a
`VITE_` variable.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SITE_URL` | Required for production | Public site origin, e.g. `https://www.example.com`; used for canonical tags and sitemap URLs. |
| `VITE_CONTACT_ENDPOINT` | Required for production | Must be `/api/contact`. |
| `RESEND_API_KEY` | Required | Secret API key from the Resend account. |
| `CONTACT_TO_EMAIL` | Required | Business mailbox that receives inquiries. |
| `CONTACT_FROM_EMAIL` | Required | Sender address on a domain verified with Resend. |
| `UPSTASH_REDIS_REST_URL` | Required | HTTPS REST URL for the Upstash Redis database used by distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Required | Secret Upstash REST token. |

The API rejects requests when required secrets are missing, malformed, or its
rate-limit service is unavailable. It allows five contact attempts per IP per
15 minutes. Keep the Upstash and Resend credentials server-side in Vercel
environment settings and rotate them if exposed.

## Tests and production build

```bash
npm run typecheck
npm test
npm run build
npm audit
```

The build validates the public URL and contact endpoint, emits a metadata-ready
HTML entry for every route, and generates `dist/sitemap.xml` plus the sitemap
directive in `dist/robots.txt` when `VITE_SITE_URL` is configured. A Vercel
Production build fails if those public URL settings are missing.

## Vercel deployment

1. Import this project into Vercel and select the Vite framework preset.
2. Set the environment variables above in the relevant Vercel environments.
3. Ensure the sender domain is verified in Resend and the Upstash database is
   active.
4. Deploy. `vercel.json` configures the Vite output, per-page SPA routes,
   serverless API function and security headers.
5. Test direct page loads and refreshes, the contact flow, `robots.txt` and
   `sitemap.xml` on the deployed domain.

The contact API sends plain-text inquiries via Resend and does not report
success unless Resend accepts the message. The API also validates request
origin, content type, size, fields, phone/email formats, honeypot and rate
limits.

## Owner review before launch

- Confirm the exact legal company name, brand relationship, advertised
  capabilities and whether each listed service is currently available.
- Supply and verify the actual receiving mailbox and Resend sender identity.
- Have the Privacy Policy, Terms and Disclaimer reviewed for the operating
  jurisdictions, actual data retention/processor practices and applicable
  regulations. Current copy is general website information, not legal advice.
- Review the external Unsplash photography and Google Fonts usage/licensing and
  replace or approve the selected assets.
- Add any real registered address, phone, or public contact details only after
  the owner provides and approves them.
