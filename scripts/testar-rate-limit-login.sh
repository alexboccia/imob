#!/bin/bash
# Testa se o rate limiting de login está REALMENTE ativo — dispara 6
# tentativas de login com credencial inexistente/errada (nunca toca conta
# real) e espera bloqueio (HTTP 429) a partir da 6ª tentativa
# (LIMITES.login.tentativas = 5, ver src/lib/rate-limit.ts).
#
# Uso:
#   ./scripts/testar-rate-limit-login.sh http://localhost:3000
#   ./scripts/testar-rate-limit-login.sh https://SEU-DOMINIO-DE-PRODUCAO
#
# Sem Upstash configurado: as 6 tentativas retornam o mesmo status (nunca
# 429) — fail-open, esperado localmente.
# Com Upstash configurado: a partir da 6ª tentativa deve aparecer 429.

set -euo pipefail

BASE_URL="${1:?Uso: $0 <base-url, ex: http://localhost:3000>}"
EMAIL_TESTE="rate-limit-probe-$$@example.invalid"
COOKIES=$(mktemp)
trap 'rm -f "$COOKIES"' EXIT

for i in $(seq 1 6); do
  CSRF=$(curl -s -c "$COOKIES" -b "$COOKIES" "$BASE_URL/api/auth/csrf" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")

  STATUS=$(curl -s -o /tmp/rl-probe-resp.json -w "%{http_code}" \
    -c "$COOKIES" -b "$COOKIES" \
    -X POST "$BASE_URL/api/auth/callback/credentials" \
    --data-urlencode "email=$EMAIL_TESTE" \
    --data-urlencode "senha=senha-de-teste-errada-de-proposito" \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "json=true")

  BLOQUEADO=$(grep -c "too_many_attempts" /tmp/rl-probe-resp.json || true)

  if [ "$STATUS" = "429" ] || [ "$BLOQUEADO" -gt 0 ]; then
    echo "Tentativa $i: HTTP $STATUS — BLOQUEADO (too_many_attempts) ✅ rate limiting ativo"
  else
    echo "Tentativa $i: HTTP $STATUS — não bloqueado"
  fi
done

rm -f /tmp/rl-probe-resp.json
echo
echo "Esperado: as 5 primeiras tentativas passam (não bloqueado), a partir"
echo "da 6ª deve aparecer 'BLOQUEADO'. Se nenhuma bloquear, rate limiting"
echo "está fail-open (Upstash não configurado ou não alcançável)."
