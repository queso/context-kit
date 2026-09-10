# Next runs on Node: Bun's runtime cannot build/start Next 16 yet (oven-sh/bun#25609).
# Bun is still the package manager, script runner, and test runner, so we layer the
# Bun binary on top of the Node image.
FROM node:24-alpine

COPY --from=oven/bun:1.3.11-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "dev"]
