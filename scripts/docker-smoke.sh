#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${DOKLADO_MOCK_BASE:-http://127.0.0.1:3000}"
started=0

cleanup() {
  if [ "$started" = 1 ]; then
    docker compose down --remove-orphans
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

docker compose up --build -d --wait --wait-timeout 120
started=1

if ! curl -sSf "$BASE/" | grep -q doklado-mock; then
  echo 'Inspector did not contain doklado-mock' >&2
  docker compose logs
  exit 1
fi

STATE="$(curl -sSf "$BASE/__mock/state")"
python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["success"] is True
assert body["invoices"] == []
assert body["counters"][0]["organizationId"] == "12345678"
assert body["counters"][0]["series"][0]["exportAbbreviation"] == "FA"
' "$STATE"

ISSUE="$(
  curl -sSf "$BASE/v1/documents/invoice-issue" \
    -H 'content-type: application/json' \
    -H 'api_key: test-api-key' \
    -d '{
      "data": {
        "organizationId": "12345678",
        "type": "issued_invoice",
        "paid": true,
        "paymentType": "card",
        "note": "Ďakujeme za účasť, Ľuboš",
        "items": [
          {
            "name": "Workshop",
            "unitPriceWithoutVat": 100,
            "vatRate": 23,
            "quantity": 2
          }
        ],
        "customer": {
          "name": "Ján Novák",
          "ico": "87654321",
          "countryCode": "sk"
        }
      }
    }'
)"
DOC_ID="$(
  python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["success"] is True
assert body["data"]["invoiceNumber"]
print(body["data"]["documentId"])
' "$ISSUE"
)"

pdf_payload() {
  curl -sSf "$BASE/v1/documents/get-invoice-pdf" \
    -H 'content-type: application/json' \
    -H 'api_key: test-api-key' \
    -d "{\"data\":{\"organizationId\":\"12345678\",\"documentId\":\"$DOC_ID\"}}"
}

PDF_JSON_1="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.json")"
PDF_JSON_2="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.json")"
PDF_PATH="$(mktemp "${TMPDIR:-/tmp}/doklado-mock-XXXXXX.pdf")"
pdf_payload >"$PDF_JSON_1"
pdf_payload >"$PDF_JSON_2"
python3 -c '
import base64, json, sys
from pathlib import Path
first = json.loads(Path(sys.argv[1]).read_text())
second = json.loads(Path(sys.argv[2]).read_text())
assert first["success"] is True
assert first["data"]["Content-Type"] == "application/pdf"
assert first["data"]["encoding"] == "base64"
assert first["data"]["data"] == second["data"]["data"]
pdf = base64.b64decode(first["data"]["data"])
assert pdf.startswith(b"%PDF-")
assert len(pdf) > 1000
Path(sys.argv[3]).write_bytes(pdf)
' "$PDF_JSON_1" "$PDF_JSON_2" "$PDF_PATH"
rm -f "$PDF_JSON_1" "$PDF_JSON_2"

if require_poppler; then
  pdffonts "$PDF_PATH" | grep -qi 'NotoSans'
  TEXT="$(pdftotext -layout "$PDF_PATH" -)"
  python3 -c '
import sys
text = sys.argv[1]
assert "Faktúra" in text
assert "Ján Novák" in text
assert "Ďakujeme za účasť, Ľuboš" in text
assert "Workshop" in text
assert "2" in text
assert "246.00 EUR" in text
assert "492.00" not in text
' "$TEXT"
fi
rm -f "$PDF_PATH"

docker compose exec -T doklado-mock node -e '
fetch("http://doklado-mock:3000/__mock/state").then(async (response) => {
  if (!response.ok) process.exit(1);
  const body = await response.json();
  if (!body.success || body.invoices.length !== 1) process.exit(1);
}).catch(() => process.exit(1));
'

INSPECTOR_STATUS="$(
  docker compose exec -T doklado-mock node -e '
fetch("http://doklado-mock:3000/", { redirect: "manual" }).then((response) => {
  process.stdout.write(String(response.status));
}).catch(() => process.exit(1));
'
)"
if [ "$INSPECTOR_STATUS" != 308 ]; then
  echo "Inspector on doklado-mock should 308, got $INSPECTOR_STATUS" >&2
  exit 1
fi

OPTIONS="$(curl -sS -o /tmp/doklado-mock-options.json -w '%{http_code}' -X OPTIONS "$BASE/v1/documents/invoice-issue")"
if [ "$OPTIONS" != 403 ]; then
  echo "OPTIONS should be 403, got $OPTIONS" >&2
  exit 1
fi
grep -q 'Unauthorized!' /tmp/doklado-mock-options.json

curl -sSf -X POST "$BASE/__mock/reset" >/dev/null
RESET_STATE="$(curl -sSf "$BASE/__mock/state")"
python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["invoices"] == []
assert body["counters"][0]["series"][0]["nextCounter"] == 1
' "$RESET_STATE"

echo 'Docker Compose smoke passed'
