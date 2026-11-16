#!/usr/bin/env bash
# Inicia el motor analítico SOLO en este equipo (127.0.0.1). El token debe ser el mismo que ANALITICA_TOKEN del API.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
: "${ANALITICA_TOKEN:?Falta ANALITICA_TOKEN en apps/analitica/.env}"
exec ./.venv/bin/python -m uvicorn spvi_analitica.app:app --host 127.0.0.1 --port "${ANALITICA_PUERTO:-4100}" --no-server-header
