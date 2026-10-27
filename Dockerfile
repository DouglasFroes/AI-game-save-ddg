# One image runs the whole product: the Rust API serves the game (/) and the admin panel (/admin).
# Build:  docker build --build-arg VITE_GOOGLE_CLIENT_ID=... -t fliper .

FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Public build-time settings of the game (see web/.env.example).
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_API_URL=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:22-alpine AS admin
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM rust:1-slim-bookworm AS api
WORKDIR /app
# Dependencies first, so editing the source does not rebuild them.
COPY api/Cargo.toml api/Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && cargo build --release \
    && rm -f target/release/fliper-api target/release/deps/fliper* target/release/deps/libfliper*
COPY api/src ./src
COPY api/migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd --system --uid 10001 fliper
WORKDIR /app
COPY --from=api /app/target/release/fliper-api /usr/local/bin/fliper-api
COPY --from=web /app/web/dist ./web
COPY --from=admin /app/admin/dist ./admin
ENV WEB_DIR=/app/web ADMIN_DIR=/app/admin BIND=0.0.0.0:8080
USER fliper
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["fliper-api", "healthcheck"]
CMD ["fliper-api"]
