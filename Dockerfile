FROM node:22.15.1-alpine AS base

RUN apk add --no-cache python3 make g++ && \
		corepack enable


FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch && pnpm install --offline

COPY src ./src/
COPY esbuild.js ./

ARG GIT_COMMIT_SHA

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \ 
		SENTRY_RELEASE_NAME=$GIT_COMMIT_SHA pnpm build

RUN pnpm prune --prod


FROM node:22.15.1-alpine

ENV TZ="Europe/Warsaw"

RUN apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

USER 1000:1000

CMD ["node", "index.js"]
