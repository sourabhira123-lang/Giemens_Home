FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/giemens?schema=giemens_crm
RUN npm ci

COPY . .
RUN npm run prisma:generate

ARG VITE_SITE_URL
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_CONTACT_ENDPOINT=/api/contact
RUN test -n "$VITE_SITE_URL" && npm run build

FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --omit=peer --ignore-scripts

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node api ./api
COPY --chown=node:node server ./server
COPY --chown=node:node src/features ./src/features
COPY --chown=node:node scripts/validate-runtime-env.mjs ./scripts/validate-runtime-env.mjs
COPY --chown=node:node scripts/cleanup-documents.ts ./scripts/cleanup-documents.ts
COPY --chown=node:node scripts/check-email.ts ./scripts/check-email.ts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/liveness').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
