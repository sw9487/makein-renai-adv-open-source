FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/
RUN npm ci && npm ci --prefix web

FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/web/node_modules ./web/node_modules
RUN bun run build

FROM oven/bun:1.3.14
WORKDIR /app
ENV NODE_ENV=production PORT=9487
COPY --from=build /app /app
EXPOSE 9487
CMD ["bun", "bin/makein-renai-adv.mjs", "--no-open", "--port", "9487"]
