FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  && rm -rf /root/.cache /root/.local

COPY --from=build /app/build ./build
COPY doklado-mock.config.example.json LICENSE ./

ARG VERSION=0.0.0
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/martindzejky/doklado-mock" \
  org.opencontainers.image.url="https://github.com/martindzejky/doklado-mock" \
  org.opencontainers.image.documentation="https://github.com/martindzejky/doklado-mock#readme" \
  org.opencontainers.image.licenses="MIT" \
  org.opencontainers.image.title="doklado-mock" \
  org.opencontainers.image.description="A local fake Doklado for issuing invoices and fetching their PDFs." \
  org.opencontainers.image.version="${VERSION}" \
  org.opencontainers.image.revision="${REVISION}"

EXPOSE 3000

CMD ["node", "build/index.js"]
