# doklado-mock

A local fake [Doklado](https://doklado.com/sk). Run it on your laptop, issue
invoices against it, download their PDFs, and inspect what your code sent. State
lives in memory and disappears on restart.

Doklado has no sandbox. Every invoice issued against production is a real numbered
document in someone's books. Point your application at this mock instead.

## What it covers

Two Doklado endpoints:

- `POST /v1/documents/invoice-issue`
- `POST /v1/documents/get-invoice-pdf`

Unknown `/v1` and `/v2` paths are logged and answered with Doklado's 403 shape,
`{"error":"Unauthorized!"}`. Wrong methods on the two document routes do the same.

An inspector UI at `/` shows the request log and issued invoices, including the PDF.
`__mock` routes let tests reset, seed, inject faults, and read state without scraping
HTML.

## Run it

Node 24 and pnpm 11.7.0.

```sh
cp doklado-mock.config.example.json doklado-mock.config.json
pnpm install
pnpm build
pnpm start
```

Or after a build:

```sh
node bin/doklado-mock.js --port 3000 --config ./doklado-mock.config.json
```

`node bin/doklado-mock.js --help` prints the flags. `--host` defaults to
`127.0.0.1`. `HOST`, `PORT`, and `DOKLADO_MOCK_CONFIG` work as environment
variables as well.

Docker:

```sh
docker compose up --build
```

The inspector and `__mock` controls have no `api_key`. They are for local use.
Docker binds `0.0.0.0` inside the container.

Point your application at `http://127.0.0.1:3000` instead of the real Doklado
gateway. The accepted `api_key` header value is `test-api-key` unless you change
the config. The example organisation IČO is `12345678`.

## Config

JSON, validated on load. Organisations (IČO, name, country, home currency, bank,
issuer email), numbering series (name, mask, export abbreviation, counter, default
flag), accepted `api_key` values, and fixed exchange rates so foreign-currency
tests stay deterministic.

`doklado-mock.config.example.json` ships with one organisation so zero-config
works. Mount a file into the container or pass `--config`.

## Try it

```sh
curl -s http://127.0.0.1:3000/v1/documents/invoice-issue \
  -H 'content-type: application/json' \
  -H 'api_key: test-api-key' \
  -d '{
    "data": {
      "organizationId": "12345678",
      "type": "issued_invoice",
      "paid": true,
      "paymentType": "card",
      "items": [
        {
          "name": "Workshop",
          "unitPriceWithoutVat": 100,
          "vatRate": 23,
          "quantity": 1
        }
      ],
      "customer": {
        "name": "Jane Doe",
        "ico": "87654321",
        "countryCode": "sk"
      }
    }
  }'
```

The response is `{ "success": true, "data": { "documentId", "invoiceNumber" } }`.
Create is not idempotent. Persist the id before fetching the PDF:

```sh
curl -s http://127.0.0.1:3000/v1/documents/get-invoice-pdf \
  -H 'content-type: application/json' \
  -H 'api_key: test-api-key' \
  -d '{"data":{"organizationId":"12345678","documentId":"<id>"}}'
```

The PDF comes back base64-encoded inside JSON, with a capitalised `Content-Type`
key. The same `documentId` always returns the same bytes.

## `__mock` controls

No `api_key`. JSON only.

| Path                 | Role                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /__mock/reset` | Clear state; counters back to config                                                                                  |
| `POST /__mock/seed`  | Load fixtures and/or series counters                                                                                  |
| `POST /__mock/fault` | Force an error, status, or latency. `afterSuccess: true` creates the invoice first, then delays or fails the response |
| `GET /__mock/state`  | Snapshot for tests                                                                                                    |
| `GET /__mock/events` | SSE of store changes                                                                                                  |

## Behaviour

The mock is built against observed Doklado production behaviour, not against their
published OpenAPI document. Where the two disagree, production wins.

- **[BEHAVIOUR.md](./BEHAVIOUR.md)** records how the real API behaves, where the spec
  is wrong, and the decisions encoded in this mock.
- **[spec/swagger.json](./spec/swagger.json)** is a vendored snapshot of Doklado's
  OpenAPI document, checked for drift on a schedule.

This mock never talks to real Doklado.

## Licence

MIT. See [LICENSE](./LICENSE).
