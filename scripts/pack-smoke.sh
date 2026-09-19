#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONSUMER=""
SERVER_PID=""
TARBALL=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$CONSUMER" ]; then
    rm -rf "$CONSUMER"
  fi
}
trap cleanup EXIT

require_poppler() {
  if command -v pdftotext >/dev/null && command -v pdffonts >/dev/null; then
    return 0
  fi
  if [ "${CI:-}" = 'true' ]; then
    echo 'poppler-utils is required in CI to read invoice PDFs' >&2
    exit 1
  fi
  return 1
}

wait_for_server() {
  local base="$1"
  local i
  for i in $(seq 1 30); do
    if curl -sSf "$base/" | grep -q doklado-mock; then
      return 0
    fi
    sleep 1
  done
  echo "Server at $base did not respond in time" >&2
  if [ -n "$SERVER_PID" ]; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
  fi
  exit 1
}

stop_server() {
  local base="$1"
  if [ -z "$SERVER_PID" ]; then
    return 0
  fi
  kill -TERM "$SERVER_PID"
  wait "$SERVER_PID" || true
  SERVER_PID=""
  if curl -sSf --max-time 1 "$base/" >/dev/null 2>&1; then
    echo "Server at $base is still running after SIGTERM" >&2
    exit 1
  fi
}

issue_invoice() {
  local base="$1"
  local api_key="$2"
  local org="$3"
  curl -sSf "$base/v1/documents/invoice-issue" \
    -H 'content-type: application/json' \
    -H "api_key: $api_key" \
    -d "{
      \"data\": {
        \"organizationId\": \"$org\",
        \"type\": \"issued_invoice\",
        \"paid\": true,
        \"paymentType\": \"card\",
        \"note\": \"Ďakujeme za včasnú úhradu.\",
        \"items\": [
          {
            \"name\": \"Workshop\",
            \"unitPriceWithoutVat\": 100,
            \"vatRate\": 23,
            \"quantity\": 2
          }
        ],
        \"customer\": {
          \"name\": \"Ján Novák\",
          \"ico\": \"87654321\",
          \"countryCode\": \"sk\"
        }
      }
    }"
}

assert_pdf() {
  local json_path="$1"
  local pdf_path="$2"
  python3 -c '
import base64, json, sys
from pathlib import Path
body = json.loads(Path(sys.argv[1]).read_text())
assert body["success"] is True
assert body["data"]["Content-Type"] == "application/pdf"
pdf = base64.b64decode(body["data"]["data"])
assert pdf.startswith(b"%PDF-")
assert len(pdf) > 1000
Path(sys.argv[2]).write_bytes(pdf)
' "$json_path" "$pdf_path"
  if require_poppler; then
    pdffonts "$pdf_path" | grep -qi 'NotoSans'
    TEXT="$(pdftotext -layout "$pdf_path" -)"
    python3 -c '
import sys
text = sys.argv[1]
assert "Faktúra" in text
assert "Ján Novák" in text
assert "Ďakujeme za včasnú úhradu." in text
assert "Workshop" in text
' "$TEXT"
  fi
}

echo 'Packing npm tarball'
PACK_OUT="$(mktemp -d "${TMPDIR:-/tmp}/doklado-mock-pack-XXXXXX")"
TARBALL="$(pnpm pack --pack-destination "$PACK_OUT" | tail -n 1)"
if [ ! -f "$TARBALL" ]; then
  TARBALL="$PACK_OUT/$(basename "$TARBALL")"
fi
echo "Tarball: $TARBALL"

CONTENTS="$(tar -tzf "$TARBALL")"
echo "$CONTENTS"

require_member() {
  local path="$1"
  if ! echo "$CONTENTS" | grep -qx "$path"; then
    echo "npm pack missing $path" >&2
    exit 1
  fi
}

forbid_prefix() {
  local prefix="$1"
  if echo "$CONTENTS" | grep -q "^$prefix"; then
    echo "npm pack should not include $prefix" >&2
    exit 1
  fi
}

require_member 'package/package.json'
require_member 'package/bin/doklado-mock.js'
require_member 'package/build/index.js'
require_member 'package/doklado-mock.config.example.json'
require_member 'package/LICENSE'
require_member 'package/README.md'
if ! echo "$CONTENTS" | grep -q '^package/build/client/'; then
  echo 'npm pack missing build/client browser assets' >&2
  exit 1
fi
if ! echo "$CONTENTS" | grep -q '^package/build/server/'; then
  echo 'npm pack missing build/server' >&2
  exit 1
fi
forbid_prefix 'package/src/'
forbid_prefix 'package/node_modules/'
forbid_prefix 'package/.svelte-kit/'
forbid_prefix 'package/scripts/'
forbid_prefix 'package/spec/'

CONSUMER="$(mktemp -d /tmp/doklado-mock-consumer-XXXXXX)"
echo "Installing into $CONSUMER"
cd "$CONSUMER"
npm init -y >/dev/null
npm install --omit=dev "$TARBALL"

test -x node_modules/.bin/doklado-mock
test -f node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff
test -f node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff
test ! -e node_modules/vite
test ! -e node_modules/@sveltejs/kit
test ! -e node_modules/lefthook

HELP="$(./node_modules/.bin/doklado-mock --help)"
echo "$HELP" | grep -q 'npx @martindzejky/doklado-mock'

PORT=3410
BASE="http://127.0.0.1:${PORT}"

echo 'Zero-config startup'
./node_modules/.bin/doklado-mock --port "$PORT" --host 127.0.0.1 &
SERVER_PID=$!
wait_for_server "$BASE"
ISSUE="$(issue_invoice "$BASE" test-api-key 12345678)"
DOC_ID="$(
  python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["success"] is True
print(body["data"]["documentId"])
' "$ISSUE"
)"
PDF_JSON="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.json")"
PDF_PATH="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.pdf")"
curl -sSf "$BASE/v1/documents/get-invoice-pdf" \
  -H 'content-type: application/json' \
  -H 'api_key: test-api-key' \
  -d "{\"data\":{\"organizationId\":\"12345678\",\"documentId\":\"$DOC_ID\"}}" \
  >"$PDF_JSON"
assert_pdf "$PDF_JSON" "$PDF_PATH"
rm -f "$PDF_JSON" "$PDF_PATH"
stop_server "$BASE"

echo 'Explicit config from the caller directory'
cat >./caller.config.json <<'EOF'
{
  "apiKeys": ["pack-smoke-key"],
  "organisations": [
    {
      "id": "11111111",
      "name": "Caller s.r.o.",
      "country": "SK",
      "homeCurrency": "EUR",
      "email": "invoices@caller.sk",
      "bank": {
        "iban": "SK3112000000198742637541",
        "bic": "GIBASKBX"
      },
      "series": [
        {
          "name": "Issued invoices",
          "mask": "#RRRRCCC",
          "exportAbbreviation": "FA",
          "counter": 1,
          "default": true
        }
      ]
    }
  ],
  "exchangeRates": { "EUR": 1 }
}
EOF
./node_modules/.bin/doklado-mock --port "$PORT" --host 127.0.0.1 --config ./caller.config.json &
SERVER_PID=$!
wait_for_server "$BASE"
WRONG="$(
  curl -sS -o /tmp/doklado-mock-wrong.json -w '%{http_code}' \
    "$BASE/v1/documents/invoice-issue" \
    -H 'content-type: application/json' \
    -H 'api_key: test-api-key' \
    -d '{"data":{"organizationId":"11111111","type":"issued_invoice","items":[{"name":"X","unitPriceWithoutVat":1,"vatRate":0,"quantity":1}],"customer":{"name":"Pat","countryCode":"sk"}}}'
)"
if [ "$WRONG" != 401 ]; then
  echo "Expected 401 for the default api_key against caller config, got $WRONG" >&2
  cat /tmp/doklado-mock-wrong.json >&2
  exit 1
fi
ISSUE="$(issue_invoice "$BASE" pack-smoke-key 11111111)"
python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["success"] is True
' "$ISSUE"
DOC_ID="$(
  python3 -c '
import json, sys
print(json.loads(sys.argv[1])["data"]["documentId"])
' "$ISSUE"
)"
PDF_JSON="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.json")"
PDF_PATH="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.pdf")"
curl -sSf "$BASE/v1/documents/get-invoice-pdf" \
  -H 'content-type: application/json' \
  -H 'api_key: pack-smoke-key' \
  -d "{\"data\":{\"organizationId\":\"11111111\",\"documentId\":\"$DOC_ID\"}}" \
  >"$PDF_JSON"
assert_pdf "$PDF_JSON" "$PDF_PATH"
rm -f "$PDF_JSON" "$PDF_PATH"
stop_server "$BASE"

echo 'Environment variables'
PORT=3411
BASE="http://127.0.0.1:${PORT}"
DOKLADO_MOCK_CONFIG="$CONSUMER/caller.config.json" \
  PORT="$PORT" \
  HOST=127.0.0.1 \
  ./node_modules/.bin/doklado-mock &
SERVER_PID=$!
wait_for_server "$BASE"
ISSUE="$(issue_invoice "$BASE" pack-smoke-key 11111111)"
python3 -c '
import json, sys
assert json.loads(sys.argv[1])["success"] is True
' "$ISSUE"
stop_server "$BASE"

rm -rf "$PACK_OUT"
echo 'npm pack smoke passed'
