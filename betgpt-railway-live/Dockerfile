FROM node:22-bookworm AS builder
WORKDIR /wrapper

ARG RAILWAY_GIT_COMMIT_SHA
ARG RAILWAY_GIT_BRANCH
ARG RAILWAY_GIT_REPO_OWNER
ARG RAILWAY_GIT_REPO_NAME
ARG RAILWAY_GIT_COMMIT_MESSAGE
ARG RAILWAY_DEPLOYMENT_ID
ARG ASTRA_CONTROL_PLANE_NONCE

ENV RAILWAY_GIT_COMMIT_SHA=${RAILWAY_GIT_COMMIT_SHA}
ENV RAILWAY_GIT_BRANCH=${RAILWAY_GIT_BRANCH}
ENV RAILWAY_GIT_REPO_OWNER=${RAILWAY_GIT_REPO_OWNER}
ENV RAILWAY_GIT_REPO_NAME=${RAILWAY_GIT_REPO_NAME}
ENV RAILWAY_GIT_COMMIT_MESSAGE=${RAILWAY_GIT_COMMIT_MESSAGE}
ENV RAILWAY_DEPLOYMENT_ID=${RAILWAY_DEPLOYMENT_ID}
ENV ASTRA_CONTROL_PLANE_NONCE=${ASTRA_CONTROL_PLANE_NONCE}
ENV NITRO_PRESET=node-server

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY control-plane-pull.mjs source-manifest.json .astra-green-release.json source-gate.mjs astra-deploy-trigger-firewall.mjs astra-deploy-trigger-firewall.json bootstrap.mjs ./

# RAILWAY_DEPLOYMENT_ID is unique for every deployment. Referencing it in this
# RUN makes the control-plane pull non-cacheable across redeployments, while the
# fetched controller files are all pinned to one zip-github commit SHA.
RUN echo "ASTRA_CONTROL_PLANE_CACHE_BUST deployment=${RAILWAY_DEPLOYMENT_ID} nonce=${ASTRA_CONTROL_PLANE_NONCE}" \
 && node control-plane-pull.mjs

RUN node source-gate.mjs
RUN node bootstrap.mjs
RUN npm --prefix app ci --include=dev --no-audit --no-fund
RUN npm --prefix app run test:results-watchdog
RUN npm --prefix app run build
RUN test -f app/.output/server/index.mjs \
 && test -f app/.output/public/astra-revision.json \
 && node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('app/.output/public/astra-revision.json','utf8'));const m=JSON.parse(fs.readFileSync('source-manifest.json','utf8'));if(r.sourceSha!==m.sourceSha)throw new Error('ASTRA_RUNTIME_REVISION_MISMATCH');console.log('ASTRA_RUNTIME_ARTIFACT_PASS',r.sourceSha)"

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libatomic1 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=builder /wrapper/app/.output ./.output
RUN test -f .output/server/index.mjs && test -f .output/public/astra-revision.json
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
# ASTRA source-refresh trigger for GREEN 69a8f3cf008353a877d4d04c8d56b3dde9ba0607
