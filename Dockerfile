FROM node:22-alpine AS base

RUN apk update --no-cache && \
		apk add --no-cache python3 make g++ && \
		corepack enable


FROM base AS build

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY package.json ./
RUN pnpm install --offline

ARG GIT_COMMIT_SHA

COPY src ./src/
COPY esbuild.mjs ./
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \ 
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm build

RUN pnpm prune --prod


FROM node:22-alpine

ENV TZ="Europe/Warsaw"

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nonroot -u 1001

RUN apk update --no-cache && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

USER nonroot

CMD ["node", "index.js"]
