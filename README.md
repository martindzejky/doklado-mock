# doklado-mock

A local fake [Doklado](https://doklado.com/sk). It fills the sandbox gap the way
[maildev](https://github.com/maildev/maildev) does for email. Run it on your laptop,
issue invoices against it, download their PDFs, and inspect what your code sent.
State lives in memory and disappears on restart.

Doklado has no sandbox. Every invoice issued against production is a real numbered
document in someone's books. Point your application at this mock instead.

## What it covers

Two Doklado endpoints:

- `POST /v1/documents/invoice-issue`
- `POST /v1/documents/get-invoice-pdf`

Unknown `/v1` and `/v2` paths are logged and answered with Doklado's 403 shape,
`{"error":"Unauthorized!"}`. Wrong methods on the two document routes, including
OPTIONS, do the same.

An inspector UI at `/` shows the request log and issued invoices, including the PDF.
`__mock` routes let tests reset, seed, inject faults, and read state without scraping
HTML.

## Run it

Node 24+. `--host` defaults to `127.0.0.1`. `HOST`, `PORT`, and
`DOKLADO_MOCK_CONFIG` work as environment variables. `--config` paths are
relative to the directory you run the command in.

```sh
npx @martindzejky/doklado-mock
npx @martindzejky/doklado-mock --port 4010 --config ./doklado-mock.config.json
```

```sh
docker run --rm -p 3000:3000 ghcr.io/martindzejky/doklado-mock:latest
```

The image listens on `0.0.0.0:3000`. Publish that port for the inspector. Other
Compose services should call `http://doklado-mock:3000`. Mount a config at
`/app/doklado-mock.config.json`.

```yaml
services:
  doklado-mock:
    image: ghcr.io/martindzejky/doklado-mock:latest
    ports:
      - '3000:3000'
    volumes:
      - ./doklado-mock.config.json:/app/doklado-mock.config.json:ro
```

From this repository:

```sh
pnpm install
pnpm build
pnpm start
```

```sh
docker compose up --build
```

The inspector and `__mock` controls have no `api_key`. They are for local use.
Point your application at `http://127.0.0.1:3000`. The accepted `api_key` is
`test-api-key` unless you change the config. The example organisation IČO is
`12345678`.

## Config

JSON, validated on load. Organisations (IČO, name, country, home currency, bank,
issuer email), numbering series (name, mask, export abbreviation, counter, default
flag), accepted `api_key` values, and fixed exchange rates so foreign-currency
tests stay deterministic.

`doklado-mock.config.example.json` ships with one organisation so zero-config
works. Mount a file into the container or pass `--config`. Default seed uses the
first organisation in that file.

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

No `api_key`. JSON only. State is in memory and disappears on restart or
`POST /__mock/reset`.

| Path                 | Role                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /__mock/reset` | Clear invoices, request log, and faults; counters back to config                                                      |
| `POST /__mock/seed`  | Load fixtures and/or series counters                                                                                  |
| `POST /__mock/fault` | Force an error, status, or latency. `afterSuccess: true` creates the invoice first, then delays or fails the response |
| `GET /__mock/state`  | Snapshot for tests                                                                                                    |
| `GET /__mock/events` | SSE of store changes                                                                                                  |

### Seed

`POST /__mock/seed`. All fields optional.

| Field      | Meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `now`      | Freeze the store clock to this ISO timestamp                    |
| `series`   | `{ organizationId, exportAbbreviation, nextCounter }` overrides |
| `invoices` | `invoice-issue` `data` objects, issued in order                 |

An empty body, `{}`, or a body with neither `invoices` nor `series` issues one
default invoice for the **first organisation in the loaded config**. Explicit
`invoices` still use the `organizationId` you send. If any invoice fails, the
whole seed rolls back (invoices and counters from that call).

```sh
curl -s http://127.0.0.1:3000/__mock/seed \
  -H 'content-type: application/json' \
  -d '{}'
```

### Fault

`POST /__mock/fault`.

| Field          | Meaning                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `path`         | Doklado path to match, for example `/v1/documents/invoice-issue`                               |
| `remaining`    | How many matching requests consume the fault. Omit or `null` to keep it until cleared          |
| `clear`        | `true` removes the fault for that path and does not install a new one                          |
| `latencyMs`    | Delay in milliseconds, capped at `30000`                                                       |
| `httpStatus`   | If set, return this HTTP status                                                                |
| `code`         | Application code in the JSON body                                                              |
| `message`      | Optional message alongside `code`                                                              |
| `afterSuccess` | Run the handler first. On a success envelope, delay and/or replace the response. Work is kept. |

A fault stays in memory until `remaining` hits zero, you `clear` that path, or
you reset. Latency runs **before** the handler unless `afterSuccess` is true, in
which case it runs after a successful create. The mock caps delay at 30 seconds.
If your client times out sooner than `latencyMs`, the client sees a timeout; with
`afterSuccess` the invoice is already stored.

#### One-shot failure

The next `invoice-issue` fails. The one after that succeeds and creates an
invoice.

```sh
curl -s http://127.0.0.1:3000/__mock/fault \
  -H 'content-type: application/json' \
  -d '{
    "path": "/v1/documents/invoice-issue",
    "remaining": 1,
    "code": "APP_INCORRECT_INPUT_DATA"
  }'
```

#### PDF-download recovery

Issue an invoice and keep `documentId`. Fail the next PDF download once, then
retry the same id. No second invoice is created.

```sh
curl -s http://127.0.0.1:3000/__mock/fault \
  -H 'content-type: application/json' \
  -d '{
    "path": "/v1/documents/get-invoice-pdf",
    "remaining": 1,
    "httpStatus": 500
  }'
```

#### Ambiguous creation (`afterSuccess`)

The mock creates the invoice, then delays and returns failure. A client that
times out during the delay, or treats the error as "create failed", already has
an invoice in the store. Retrying `invoice-issue` creates another one. Inspect
`/__mock/state` or the inspector and fetch the PDF by `documentId`.

```sh
curl -s http://127.0.0.1:3000/__mock/fault \
  -H 'content-type: application/json' \
  -d '{
    "path": "/v1/documents/invoice-issue",
    "remaining": 1,
    "afterSuccess": true,
    "latencyMs": 5000,
    "code": "APP_INCORRECT_INPUT_DATA"
  }'
```

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
