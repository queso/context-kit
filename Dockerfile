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
# The remap below rejects an APP_UID/APP_GID already claimed by another account in
# node:24-alpine (e.g. GID 65534, owned by `nobody`) instead of failing deep inside
# `addgroup`/`adduser`, and is safe to run whether or not `deluser` also drops the primary group.
ARG UID=1000
ARG GID=1000
RUN if [ "$UID:$GID" != "$(id -u node):$(id -g node)" ]; then \
      set -e; \
      OWNER="$(getent passwd "$UID" | cut -d: -f1)"; \
      if [ -n "$OWNER" ] && [ "$OWNER" != "node" ]; then \
        echo "APP_UID=$UID is already used by '$OWNER' in this image; pick a different APP_UID" >&2; \
        exit 1; \
      fi; \
      OWNGROUP="$(getent group "$GID" | cut -d: -f1)"; \
      if [ -n "$OWNGROUP" ] && [ "$OWNGROUP" != "node" ]; then \
        echo "APP_GID=$GID is already used by '$OWNGROUP' in this image; pick a different APP_GID" >&2; \
        exit 1; \
      fi; \
      deluser node; \
      delgroup node 2>/dev/null || true; \
      addgroup -g "$GID" node; \
      adduser -u "$UID" -G node -h /home/node -s /bin/sh -D node; \
      chown -R node:node /home/node; \
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
