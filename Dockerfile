FROM node:20-alpine AS base

RUN apk update && \
		apk add --no-cache libc6-compat python3 make g++ && \
		corepack enable


FROM base AS build

COPY src ./src/
COPY package.json pnpm-lock.yaml esbuild.mjs ./
RUN pnpm install --frozen-lockfile && \
		pnpm build && \
		pnpm prune --prod


FROM node:20-alpine

RUN apk update && \
		apk add --no-cache ffmpeg

COPY --from=build package.json ./dist/
COPY --from=build dist ./dist/
COPY --from=build node_modules ./dist/node_modules/

WORKDIR /dist

CMD ["node", "index.js"]
