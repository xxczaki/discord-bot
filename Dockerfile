FROM ghcr.io/xxczaki/discord-bot-base:latest AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.mjs ./
COPY packages/discord-player-googlevideo/package.json ./packages/discord-player-googlevideo/

RUN pnpm fetch && pnpm install --offline --frozen-lockfile


FROM deps AS build

COPY src ./src/
COPY esbuild.js ./
COPY packages/discord-player-googlevideo ./packages/discord-player-googlevideo

ARG GIT_COMMIT_SHA

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm recursive --include-workspace-root run build


FROM deps AS prod-deps

COPY packages/discord-player-googlevideo ./packages/discord-player-googlevideo
RUN pnpm --filter discord-player-googlevideo run build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
		CI=true pnpm install --offline --frozen-lockfile --prod --config.enableGlobalVirtualStore=false


FROM node:24.14.1-alpine

ENV TZ="Europe/Berlin"

RUN apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=prod-deps node_modules ./dist/node_modules/
COPY --from=prod-deps packages ./dist/packages/

WORKDIR /dist

USER 1000:1000

CMD ["node", "index.js"]
