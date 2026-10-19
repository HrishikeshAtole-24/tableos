# TableOS API (Express + Socket.IO + pg-boss workers). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t tableos-api .
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile --filter @tableos/api... --ignore-scripts
COPY packages/db packages/db
COPY packages/schemas packages/schemas
COPY apps/api apps/api
RUN pnpm --filter @tableos/db generate && pnpm --filter @tableos/api build
RUN pnpm deploy --filter @tableos/api --prod --legacy --ignore-scripts /out && cp -r apps/api/dist /out/dist && cp -r packages/db/prisma /out/prisma

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 1001 tableos
COPY --from=build /out ./
USER tableos
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
