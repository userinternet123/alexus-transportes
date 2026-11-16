#!/usr/bin/env bash
# Publica SPVI Central con Tailscale (Linux). Panel privado :8443, solo /api/agente público.
set -euo pipefail
codigo=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/panel/resumen || true)
[ "$codigo" = "401" ] || { echo "SPVI Central no responde en 127.0.0.1:3000 (docker compose -f docker-compose.local.yml up -d --build)"; exit 1; }
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3000
sudo tailscale funnel --bg --set-path=/api/agente http://127.0.0.1:3000/api/agente
nombre=$(tailscale status --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
echo; echo "Panel (privado):            https://$nombre:8443"; echo "CENTRAL_URL de las tiendas: https://$nombre"
echo "Agregue al .env de Central: URL_PUBLICA=https://$nombre"
tailscale funnel status
