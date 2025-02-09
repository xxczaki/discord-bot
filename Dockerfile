FROM node:22-alpine AS base

RUN apk update --no-cache && \
		apk add --no-cache python3 make g++ && \
		npm install --global corepack@0.31.0 && \
		corepack enable


FROM base AS build

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY package.json ./
RUN pnpm install --offline

COPY src ./src/
COPY esbuild.mjs ./

ARG GIT_COMMIT_SHA

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \ 
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm build

RUN pnpm prune --prod


FROM node:22-alpine

ENV TZ="Europe/Warsaw"

RUN apk update --no-cache && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

USER 1000:1000

CMD ["node", "--import", "./utils/sentry.js", "index.js"]
