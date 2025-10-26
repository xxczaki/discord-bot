FROM node:22.21.0-alpine AS base

RUN apk add --no-cache build-base python3 make g++ cairo-dev pango-dev && \
		corepack enable

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/discord-player-googlevideo/package.json ./packages/discord-player-googlevideo/

RUN pnpm fetch && pnpm install --offline

COPY src ./src/
COPY esbuild.js ./
COPY packages/discord-player-googlevideo ./packages/discord-player-googlevideo

ARG GIT_COMMIT_SHA

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm recursive --include-workspace-root run build

RUN CI=true pnpm prune --prod


FROM node:22.21.0-alpine

ENV TZ="Europe/Warsaw"

RUN apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

USER 1000:1000

CMD ["node", "index.js"]
