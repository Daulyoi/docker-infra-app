#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
PAYLOAD_FILE="${DATA_DIR}/payload.json"
RESULTS_DIR="${PROJECT_ROOT}/load-test-results"

BACKEND_URL="http://127.0.0.1:3000"
FRONTEND_URL="http://127.0.0.1:8080"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() {
  echo -e "${CYAN}[INFO]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${RESET} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${RESET} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${RESET} $1"
}

check_prerequisites() {
  log_info "Checking prerequisites..."

  if ! command -v hey >/dev/null 2>&1; then
    log_error "'hey' CLI tool is not installed or not in PATH."
    log_error "Please install hey (e.g., via 'go install github.com/rakyll/hey@latest' or package manager)."
    exit 1
  fi
  log_success "Found hey at: $(command -v hey)"

  if ! command -v docker >/dev/null 2>&1; then
    log_error "'docker' command not found."
    exit 1
  fi

  cd "${PROJECT_ROOT}"
  if ! docker compose ps --status running >/dev/null 2>&1; then
    log_error "Docker Compose stack is not running or docker compose is unavailable."
    exit 1
  fi
  log_success "Docker Compose stack is active."

  # Check backend health
  log_info "Probing backend health at ${BACKEND_URL}/api/health..."
  local health_code
  health_code=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/health" || true)
  if [[ "${health_code}" != "200" ]]; then
    log_error "Backend health check failed with status ${health_code} (expected 200)."
    exit 1
  fi
  log_success "Backend health check passed (200 OK)."

  # Check frontend
  log_info "Probing frontend at ${FRONTEND_URL}/..."
  local frontend_code
  frontend_code=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}/" || true)
  if [[ "${frontend_code}" != "200" ]]; then
    log_error "Frontend health check failed with status ${frontend_code} (expected 200)."
    exit 1
  fi
  log_success "Frontend check passed (200 OK)."

  mkdir -p "${RESULTS_DIR}"
  log_success "All pre-flight checks passed."
}

# Sampler for docker compose stats
SAMPLER_PID=""

start_stats_sampler() {
  local output_file="$1"
  cd "${PROJECT_ROOT}"
  (
    while true; do
      echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") ===" >> "${output_file}"
      docker compose stats --no-stream >> "${output_file}" 2>&1 || true
      sleep 1
    done
  ) &
  SAMPLER_PID=$!
}

stop_stats_sampler() {
  if [[ -n "${SAMPLER_PID}" ]]; then
    kill "${SAMPLER_PID}" 2>/dev/null || true
    wait "${SAMPLER_PID}" 2>/dev/null || true
    SAMPLER_PID=""
  fi
}

cleanup() {
  stop_stats_sampler
}
trap cleanup EXIT INT TERM

# Run a single benchmark scenario with resource monitoring
run_scenario() {
  local name="$1"
  local url="$2"
  local requests="$3"
  local concurrency="$4"
  shift 4
  local extra_args=("$@")

  local timestamp
  timestamp="$(date +"%Y%m%d_%H%M%S")"
  local run_dir="${RESULTS_DIR}/${timestamp}_${name}"
  mkdir -p "${run_dir}"

  local hey_output="${run_dir}/hey_output.txt"
  local stats_baseline="${run_dir}/docker_stats_baseline.txt"
  local stats_samples="${run_dir}/docker_stats_samples.txt"
  local stats_final="${run_dir}/docker_stats_final.txt"

  echo ""
  echo -e "${BOLD}======================================================================${RESET}"
  echo -e "${BOLD}SCENARIO: ${name}${RESET}"
  echo -e "URL: ${url}"
  echo -e "Requests (-n): ${requests} | Concurrency (-c): ${concurrency}"
  if [[ ${#extra_args[@]} -gt 0 ]]; then
    echo -e "Extra flags: ${extra_args[*]}"
  fi
  echo -e "${BOLD}======================================================================${RESET}"

  cd "${PROJECT_ROOT}"
  log_info "Capturing baseline docker compose stats..."
  docker compose stats --no-stream | tee "${stats_baseline}"

  log_info "Starting continuous docker compose stats monitoring..."
  start_stats_sampler "${stats_samples}"

  log_info "Executing hey load generator..."
  set +e
  hey -n "${requests}" -c "${concurrency}" "${extra_args[@]}" "${url}" 2>&1 | tee "${hey_output}"
  local hey_status=$?
  set -e

  stop_stats_sampler
  log_info "Monitoring stopped."

  log_info "Capturing post-test docker compose stats..."
  docker compose stats --no-stream | tee "${stats_final}"

  if [[ ${hey_status} -ne 0 ]]; then
    log_error "hey exited with error code ${hey_status}."
  else
    log_success "Scenario ${name} completed successfully."
  fi
  log_info "Artifacts recorded in: ${run_dir}"
}

scenario_static() {
  local reqs="${1:-5000}"
  local conc="${2:-50}"
  run_scenario "static_nginx" "${FRONTEND_URL}/" "${reqs}" "${conc}"
}

scenario_cached() {
  local reqs="${1:-5000}"
  local conc="${2:-50}"
  log_info "Warming up list cache..."
  curl -s "${BACKEND_URL}/api/items" >/dev/null || true
  run_scenario "cached_read_backend" "${BACKEND_URL}/api/items" "${reqs}" "${conc}"
}

scenario_proxy_cached() {
  local reqs="${1:-5000}"
  local conc="${2:-50}"
  log_info "Warming up list cache via Nginx proxy..."
  curl -s "${FRONTEND_URL}/api/items" >/dev/null || true
  run_scenario "cached_read_nginx_proxy" "${FRONTEND_URL}/api/items" "${reqs}" "${conc}"
}

scenario_db_read() {
  local reqs="${1:-2000}"
  local conc="${2:-20}"
  run_scenario "db_read_single_item" "${BACKEND_URL}/api/items/1" "${reqs}" "${conc}"
}

scenario_health() {
  local reqs="${1:-2000}"
  local conc="${2:-25}"
  run_scenario "health_check" "${BACKEND_URL}/api/health" "${reqs}" "${conc}"
}

scenario_write() {
  local reqs="${1:-500}"
  local conc="${2:-20}"
  if [[ ! -f "${PAYLOAD_FILE}" ]]; then
    log_error "Payload file not found: ${PAYLOAD_FILE}"
    exit 1
  fi
  run_scenario "write_items" "${BACKEND_URL}/api/items" "${reqs}" "${conc}" \
    -m POST -T "application/json" -D "${PAYLOAD_FILE}"
}

scenario_scaling() {
  local reqs="${1:-1000}"
  local concs=("10" "25" "50" "100" "150" "200")
  log_info "Starting Concurrency Scaling Sweep (Requests per level: ${reqs})..."
  for c in "${concs[@]}"; do
    scenario_cached "${reqs}" "${c}"
    sleep 2
  done
}

scenario_all() {
  log_info "Running full benchmark suite..."
  scenario_static 3000 50
  sleep 2
  scenario_cached 3000 50
  sleep 2
  scenario_proxy_cached 3000 50
  sleep 2
  scenario_db_read 1500 20
  sleep 2
  scenario_health 1500 25
  sleep 2
  scenario_write 300 15
  log_success "All benchmark scenarios completed!"
}

scenario_cleanup() {
  local clean_results="${1:-}"

  log_info "Initiating cleanup of load test data..."

  cd "${PROJECT_ROOT}"

  local total_before
  total_before=$(docker compose exec -T db psql -U "${DB_USER:-notes}" -d "${DB_NAME:-notesdb}" -t -c "SELECT count(*) FROM items;" 2>/dev/null | tr -d ' \r\n' || echo "0")
  log_info "Current total items in database: ${total_before}"

  log_info "Purging generated load test notes from PostgreSQL..."
  docker compose exec -T db psql -U "${DB_USER:-notes}" -d "${DB_NAME:-notesdb}" -c \
    "DELETE FROM items WHERE title = 'Load Test Note' OR id > 3;" >/dev/null

  log_info "Ensuring baseline initial notes (IDs 1, 2, 3) are present..."
  docker compose exec -T db psql -U "${DB_USER:-notes}" -d "${DB_NAME:-notesdb}" -c \
    "INSERT INTO items (id, title, body) VALUES
      (1, 'Welcome', 'Your first note — try adding more from the UI.'),
      (2, 'Docker tip', 'Use service names (db, cache) as hostnames on the Compose network.'),
      (3, 'Volumes', 'Bind-mount this init.sql; use a named volume for Postgres data.')
     ON CONFLICT (id) DO NOTHING;" >/dev/null

  log_info "Resetting PostgreSQL serial auto-increment sequence..."
  docker compose exec -T db psql -U "${DB_USER:-notes}" -d "${DB_NAME:-notesdb}" -c \
    "SELECT setval('items_id_seq', (SELECT COALESCE(MAX(id), 1) FROM items));" >/dev/null

  log_info "Invalidating Redis cache key (items:all)..."
  docker compose exec -T redis redis-cli del items:all >/dev/null 2>&1 || true

  local total_after
  total_after=$(docker compose exec -T db psql -U "${DB_USER:-notes}" -d "${DB_NAME:-notesdb}" -t -c "SELECT count(*) FROM items;" 2>/dev/null | tr -d ' \r\n' || echo "0")

  log_success "Database cleanup completed. Item count: ${total_before} -> ${total_after}."

  if [[ "${clean_results}" == "--results" || "${clean_results}" == "-r" ]]; then
    log_info "Pruning load test artifacts from ${RESULTS_DIR}..."
    rm -rf "${RESULTS_DIR:?}"/*
    log_success "Load test results directory cleared."
  fi

  # Verify API response
  log_info "Verifying backend items endpoint..."
  local api_items_count
  api_items_count=$(curl -s "${BACKEND_URL}/api/items" | grep -o '"id":' | wc -l || echo "0")
  log_success "API confirmed serving ${api_items_count} items."
}

show_usage() {
  echo "Usage: $0 [scenario] [options]"
  echo ""
  echo "Scenarios:"
  echo "  check         Run pre-flight checks on hey, docker compose, and endpoints"
  echo "  static        Benchmark static asset serving from Nginx (default: -n 5000 -c 50)"
  echo "  cached        Benchmark cached list read from direct backend :3000 (default: -n 5000 -c 50)"
  echo "  proxy-cached  Benchmark cached list read through Nginx proxy :8080 (default: -n 5000 -c 50)"
  echo "  db-read       Benchmark uncached database read :3000/api/items/1 (default: -n 2000 -c 20)"
  echo "  health        Benchmark health check :3000/api/health (default: -n 2000 -c 25)"
  echo "  write         Benchmark item creation and cache invalidation :3000/api/items (default: -n 500 -c 20)"
  echo "  scaling       Run concurrency scaling sweep (c=10, 25, 50, 100, 150, 200)"
  echo "  all           Execute the complete benchmark suite"
  echo "  cleanup       Purge test data from Postgres, reset ID sequence, and flush Redis cache"
  echo "                (Optional: pass --results to also clear load-test-results/)"
  echo ""
  echo "Custom Parameters:"
  echo "  $0 cached 1000 20    (runs scenario with 1000 requests and concurrency 20)"
  echo "  $0 cleanup --results (cleans database records AND clears saved result logs)"
  echo ""
}

# Main routing
SCENARIO="${1:-check}"
ARG_N="${2:-}"
ARG_C="${3:-}"

case "${SCENARIO}" in
  check)
    check_prerequisites
    ;;
  static)
    check_prerequisites
    scenario_static ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  cached)
    check_prerequisites
    scenario_cached ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  proxy-cached)
    check_prerequisites
    scenario_proxy_cached ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  db-read)
    check_prerequisites
    scenario_db_read ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  health)
    check_prerequisites
    scenario_health ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  write)
    check_prerequisites
    scenario_write ${ARG_N:+"$ARG_N"} ${ARG_C:+"$ARG_C"}
    ;;
  scaling)
    check_prerequisites
    scenario_scaling ${ARG_N:+"$ARG_N"}
    ;;
  all)
    check_prerequisites
    scenario_all
    ;;
  cleanup)
    check_prerequisites
    scenario_cleanup ${ARG_N:+"$ARG_N"}
    ;;
  -h|--help|help)
    show_usage
    ;;
  *)
    log_error "Unknown scenario: ${SCENARIO}"
    show_usage
    exit 1
    ;;
esac
