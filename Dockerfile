FROM node:20-alpine AS base

RUN apk update --no-cache && \
		apk add --no-cache python3 make g++ && \
		corepack enable


FROM base AS build

COPY src ./src/
COPY package.json pnpm-lock.yaml esbuild.mjs ./
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
		--mount=type=secret,id=GIT_COMMIT \
		pnpm install --frozen-lockfile && \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" GIT_COMMIT="$(cat /run/secrets/GIT_COMMIT)" pnpm build && \
		pnpm prune --prod


FROM node:20-alpine

ENV TZ="Europe/Warsaw"

RUN apk update --no-cache && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

CMD ["node", "index.js"]
