FROM node:22-alpine AS base

RUN apk update --no-cache && \
		apk add --no-cache python3 make g++ && \
		corepack enable


FROM base AS build

ARG GIT_COMMIT_SHA

COPY src ./src/
COPY pnpm-lock.yaml esbuild.mjs ./
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    pnpm fetch && \
		pnpm install --offline && \
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm build && \
		pnpm prune --prod


FROM node:22-alpine

ENV TZ="Europe/Warsaw"

RUN apk update --no-cache && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

CMD ["node", "index.js"]
