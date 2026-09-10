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

# The container runs as the unprivileged `node` user (CWE-250). docker-compose bind-mounts the
# source tree at /app, so the container user must be able to write there: `next dev` writes
# next-env.d.ts into it. node:24-alpine ships `node` as 1000:1000, which matches the
# first user on most Linux hosts; Docker Desktop and OrbStack map ownership for you. On a Linux
# host whose user is not 1000, rebuild with matching ids (docker-compose.yml maps APP_UID/APP_GID
# to these args; shells reserve the names UID and GID):
#   APP_UID=$(id -u) APP_GID=$(id -g) docker compose up -d --build
ARG UID=1000
ARG GID=1000
RUN if [ "$UID:$GID" != "$(id -u node):$(id -g node)" ]; then \
      deluser node \
      && addgroup -g "$GID" node \
      && adduser -u "$UID" -G node -h /home/node -s /bin/sh -D node \
      && chown -R node:node /home/node; \
    fi \
  && mkdir -p /app && chown node:node /app

WORKDIR /app
USER node

COPY --chown=node:node package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --chown=node:node . .

# docker-compose mounts anonymous volumes over node_modules and .next and the named `data`
# volume over data. A volume copies its ownership from the image directory it covers when it
# is first created, so these must exist here, owned by node, or the volumes come up root-owned.
RUN mkdir -p data .next node_modules

EXPOSE 3000

CMD ["bun", "run", "dev"]
