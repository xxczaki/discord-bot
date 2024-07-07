FROM node:20-alpine AS base

RUN apk update --no-cache && \
		apk add --no-cache python3 make g++ && \
		corepack enable


FROM base AS build

COPY src ./src/
COPY package.json pnpm-lock.yaml esbuild.mjs ./
RUN pnpm install --frozen-lockfile
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)" pnpm build && \
RUN pnpm prune --prod


FROM node:20-alpine

ENV TZ="Europe/Warsaw"

RUN apk update --no-cache && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

CMD ["node", "index.js"]
