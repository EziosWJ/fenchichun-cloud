# syntax=docker/dockerfile:1

FROM node:24-alpine AS frontend

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run build

FROM golang:1.26.5-alpine AS build

WORKDIR /src

RUN apk add --no-cache gcc musl-dev

COPY server/go.mod server/go.sum ./
RUN go mod download

COPY server/ .
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM build AS api-build

COPY --from=frontend /web/dist ./internal/webui/dist
RUN CGO_ENABLED=1 go build -tags=embedweb -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.22 AS runtime

RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY server/configs ./configs
# Named-volume mount point: must exist and be writable by the app user,
# otherwise file uploads fail with permission denied after the first boot.
RUN mkdir -p /var/lib/base-go-api/uploads && chown -R app:app /var/lib/base-go-api
USER app

FROM runtime AS api

COPY --from=api-build /out/api ./api
EXPOSE 8080
ENTRYPOINT ["/app/api"]

FROM runtime AS migrate

COPY --from=build /out/migrate ./migrate
COPY server/migrations ./migrations
ENTRYPOINT ["/app/migrate"]
