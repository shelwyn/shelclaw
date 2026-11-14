#!/usr/bin/env sh
# Shelclaw self-hosted stack:
#   - Shelclaw app
#   - Activepieces app + worker
#   - Activepieces PostgreSQL (pgvector image)
#   - Activepieces Redis
#
# Usage:
#   ./selfhost.sh            # create config (first run) and start everything
#   ./selfhost.sh up
#   ./selfhost.sh activepieces  # start only Activepieces for local development
#   ./selfhost.sh down
#   ./selfhost.sh logs
#   ./selfhost.sh status
#   ./selfhost.sh backup
#   ./selfhost.sh reset --yes
#
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
CONFIG_DIR="$ROOT/.selfhost"
AP_ENV="$CONFIG_DIR/activepieces.env"
APP_ENV="$CONFIG_DIR/shelclaw.env"
COMPOSE="docker compose --env-file $AP_ENV -f docker-compose.selfhost.yml"

say() { printf '%s\n' "$1"; }
die() { printf 'Error: %s\n' "$1" >&2; exit 1; }

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. See https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker and try again."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose, not docker-compose)."
}

rand_hex() {
  bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  elif command -v od >/dev/null 2>&1; then
    od -An -tx1 -N"$bytes" /dev/urandom | tr -d ' \n'
  else
    die "Need openssl or od to generate secrets."
  fi
}

resolve_ap_version() {  fallback="0.88.3"
  version=""
  if command -v curl >/dev/null 2>&1; then
    version="$(curl -L -s -o /dev/null -w '%{url_effective}' https://github.com/activepieces/activepieces/releases/latest 2>/dev/null | sed 's#.*/##')"
  fi
  case "$version" in
    [0-9]*) printf '%s' "$version" ;;
    *) printf '%s' "$fallback" ;;
  esac
}

ensure_ca_bundle() {
  target="$CONFIG_DIR/ca.pem"
  if [ -s "$target" ]; then
    return
  fi
  for candidate in "${CA_CERT_FILE:-}" "${SSL_CERT_FILE:-}" /etc/ssl/cert.pem /etc/ssl/certs/ca-certificates.crt; do
    if [ -n "$candidate" ] && [ -f "$candidate" ] && [ -s "$candidate" ]; then
      cp "$candidate" "$target"
      say "Using CA bundle: $candidate"
      return
    fi
  done
  : >"$target"
  say "Warning: no CA bundle found. Piece sync may fail behind a TLS-inspecting proxy."
}

ensure_env_line() {
  file="$1"
  key="$2"
  value="$3"
  if [ -f "$file" ] && ! grep -q "^${key}=" "$file"; then
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

ensure_config() {
  mkdir -p "$CONFIG_DIR"
  ensure_ca_bundle
  if [ ! -f "$APP_ENV" ]; then
    cat >"$APP_ENV" <<EOF
HOST=0.0.0.0
PORT=${SHELCLAW_PORT:-8787}
DATA_DIR=/data
APP_TOKEN=${APP_TOKEN:-}
ACTIVEPIECES_BASE_URL=http://activepieces-app:80
ACTIVEPIECES_MCP_URL=http://activepieces-app:80/mcp
ACTIVEPIECES_UI_URL=http://localhost:${ACTIVEPIECES_PORT:-8080}
EOF
    say "Created $APP_ENV"
  fi
  if [ ! -f "$AP_ENV" ]; then
    ap_version="$(resolve_ap_version)"
    port="${ACTIVEPIECES_PORT:-8080}"
    app_port="${SHELCLAW_PORT:-8787}"
    cat >"$AP_ENV" <<EOF
AP_VERSION=$ap_version
ACTIVEPIECES_PORT=$port
SHELCLAW_PORT=$app_port
AP_EDITION=ee
AP_ENVIRONMENT=prod
AP_EXECUTION_MODE=SANDBOX_CODE_ONLY
AP_FRONTEND_URL=http://localhost:$port
AP_API_KEY=$(rand_hex 32)
AP_ENCRYPTION_KEY=$(rand_hex 16)
AP_JWT_SECRET=$(rand_hex 32)
AP_POSTGRES_HOST=activepieces-postgres
AP_POSTGRES_PORT=5432
AP_POSTGRES_DATABASE=activepieces
AP_POSTGRES_USERNAME=postgres
AP_POSTGRES_PASSWORD=$(rand_hex 32)
AP_REDIS_HOST=activepieces-redis
AP_REDIS_PORT=6379
AP_TELEMETRY_ENABLED=false
EOF
    say "Created $AP_ENV"
    say "Back up .selfhost/activepieces.env and .selfhost/shelclaw.env."
  fi
  ap_port="$(grep '^ACTIVEPIECES_PORT=' "$AP_ENV" 2>/dev/null | cut -d= -f2)"
  ap_port="${ap_port:-${ACTIVEPIECES_PORT:-8080}}"
  ensure_env_line "$APP_ENV" ACTIVEPIECES_UI_URL "http://localhost:$ap_port"
  ensure_env_line "$APP_ENV" ACTIVEPIECES_MCP_URL "http://activepieces-app:80/mcp"
}

wait_http() {
  url="$1"
  label="$2"
  i=0
  while [ "$i" -lt 90 ]; do
    if command -v curl >/dev/null 2>&1 && curl -fsS -m 3 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  say "$label did not become healthy. Check: ./selfhost.sh logs"
  return 1
}

start() {
  need_docker
  ensure_config
  say "Building and starting the self-hosted stack..."
  $COMPOSE up -d --build
  ap_port="$(grep '^ACTIVEPIECES_PORT=' "$AP_ENV" | cut -d= -f2)"
  shelclaw_port="$(grep '^PORT=' "$APP_ENV" | cut -d= -f2)"
  say ""
  say "Shelclaw     http://localhost:${shelclaw_port:-8787}"
  say "Activepieces  http://localhost:${ap_port:-8080}"
  wait_http "http://localhost:${shelclaw_port:-8787}/api/health" "Shelclaw" || true
  wait_http "http://localhost:${ap_port:-8080}/api/v1/health" "Activepieces" || true
  say ""
  say "Services:"
  $COMPOSE ps
}

start_activepieces() {
  need_docker
  ensure_config
  say "Starting Activepieces only (development mode)..."
  $COMPOSE up -d activepieces-postgres activepieces-redis activepieces-app activepieces-worker
  ap_port="$(grep '^ACTIVEPIECES_PORT=' "$AP_ENV" | cut -d= -f2)"
  say ""
  say "Activepieces  http://localhost:${ap_port:-8080}"
  say "Create the first account there; it becomes the platform administrator."
  wait_http "http://localhost:${ap_port:-8080}/api/v1/health" "Activepieces" || true
  say ""
  say "Services:"
  $COMPOSE ps
}

case "${1:-up}" in
  up|start)
    start
    ;;
  activepieces|ap)
    start_activepieces
    ;;
  down|stop)
    need_docker
    [ -f "$AP_ENV" ] || die "No config found. Run ./selfhost.sh first."
    $COMPOSE down
    ;;
  logs)
    need_docker
    $COMPOSE logs -f
    ;;
  status|ps)
    need_docker
    $COMPOSE ps
    ;;
  backup)
    need_docker
    ensure_config
    mkdir -p "$ROOT/backups"
    stamp="$(date +%Y%m%d-%H%M%S)"
    db_name="$(grep '^AP_POSTGRES_DATABASE=' "$AP_ENV" | cut -d= -f2)"
    db_user="$(grep '^AP_POSTGRES_USERNAME=' "$AP_ENV" | cut -d= -f2)"
    say "Backing up Activepieces database..."
    $COMPOSE exec -T activepieces-postgres pg_dump -U "${db_user:-postgres}" "${db_name:-activepieces}" >"$ROOT/backups/activepieces-$stamp.sql"
    say "Backing up Shelclaw data volume..."
    docker run --rm -v shelclaw-data:/data -v "$ROOT/backups":/backup alpine \
      tar czf "/backup/shelclaw-data-$stamp.tgz" -C /data .
    cp "$AP_ENV" "$ROOT/backups/activepieces-env-$stamp"
    cp "$APP_ENV" "$ROOT/backups/shelclaw-env-$stamp"
    say "Backup written to $ROOT/backups"
    ;;
  reset)
    [ "${2:-}" = "--yes" ] || die "This deletes all containers and volumes. Re-run: ./selfhost.sh reset --yes"
    need_docker
    [ -f "$AP_ENV" ] || die "No config found."
    $COMPOSE down -v
    say "Containers and data volumes removed."
    ;;
  help|-h|--help)
    sed -n '2,19p' "$0"
    ;;
  *)
    die "Unknown command: $1 (try ./selfhost.sh help)"
    ;;
esac
