# Next runs on Node: Bun's runtime cannot build/start Next 16 yet (oven-sh/bun#25609).
# Bun is still the package manager, script runner, and test runner, so we layer the
# Bun binary on top of the Node image.
#
# BUN_VERSION must match .bun-version and "packageManager" in package.json. Renovate ignores Bun
# on purpose (see renovate.json), so all three pins move together by hand when Bun is bumped.
ARG BUN_VERSION=1.3.11
FROM oven/bun:${BUN_VERSION}-alpine AS bun

FROM node:24-alpine

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "dev"]
