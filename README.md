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
`DOKLADO_MOCK_CONFIG` work as environment variables. Paths in `--config` are
resolved from the directory you run the command in.

```sh
npx @martindzejky/doklado-mock --help
npx @martindzejky/doklado-mock
npx @martindzejky/doklado-mock --port 4010 --config ./doklado-mock.config.json
```

Or install it and call `doklado-mock` from your project.

Docker from GHCR:

```sh
docker run --rm -p 3000:3000 ghcr.io/martindzejky/doklado-mock:1.0.0
```

The image listens on `0.0.0.0:3000` inside the container. Publish that port to
open the inspector on your machine. Other Compose services should call the API
at `http://doklado-mock:3000`. Mount a config over the packaged default:

```sh
docker run --rm -p 3000:3000 \
  -v "$PWD/doklado-mock.config.json:/app/doklado-mock.config.json:ro" \
  ghcr.io/martindzejky/doklado-mock:1.0.0
```

```yaml
services:
  doklado-mock:
    image: ghcr.io/martindzejky/doklado-mock:1.0.0
    ports:
      - '3000:3000'
    volumes:
      - ./doklado-mock.config.json:/app/doklado-mock.config.json:ro
```

From this repository, Node 24 and pnpm 11.7.0:

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

```sh
docker compose up --build
```

`./scripts/docker-smoke.sh` builds that image, waits until it answers, then issues
an invoice and fetches its PDF. `./scripts/pack-smoke.sh` packs the npm package,
installs it in a temporary project, and does the same through the published CLI.

The inspector and `__mock` controls have no `api_key`. They are for local use.

Point your application at `http://127.0.0.1:3000` instead of the real Doklado
gateway. The accepted `api_key` header value is `test-api-key` unless you change
the config. The example organisation IČO is `12345678`.

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

## Releases

GitHub Actions publishes npm and GHCR from `v*.*.*` tags. Do not publish from
your machine. Do not push a tag until the one-time registry setup below is done.

A stable tag such as `v1.0.0` publishes npm `1.0.0` on `latest` and images
`ghcr.io/martindzejky/doklado-mock:1.0.0` and `:latest`. A prerelease tag such as
`v1.1.0-rc.1` publishes npm on the `next` dist-tag and image `1.1.0-rc.1` only.

The tag must match `package.json` (`v` plus the version).

### One-time registry setup

**npm.** Trusted publishing cannot attach to a name that does not exist yet.

1. `npm login` with 2FA.
2. From an empty temp directory, publish a public stub so the scoped name exists:

   ```sh
   npm publish --access public --tag bootstrap
   ```

   Use `"name": "@martindzejky/doklado-mock"` and `"version": "0.0.0"`. The first
   publish also sets `latest` to `0.0.0`. The `v1.0.0` workflow moves `latest`.

3. On npmjs.com, open `@martindzejky/doklado-mock` → Package Settings → Trusted
   Publisher → GitHub Actions:

   - Organization or user: `martindzejky`
   - Repository: `doklado-mock`
   - Workflow filename: `publish.yml` (filename only, including `.yml`)
   - Environment: leave empty
   - Allowed actions: `npm publish`

4. Do not store an npm token in GitHub. The workflow uses OIDC. Do not add
   `registry-url` to `actions/setup-node`; that writes an empty `_authToken` and
   skips the OIDC exchange.
5. After the first CI publish succeeds, you can set Publishing access to require
   2FA and disallow tokens. Trusted publishing keeps working.

**GHCR.** No personal access token. The workflow uses `GITHUB_TOKEN` with
`packages: write`. The first image push creates
`ghcr.io/martindzejky/doklado-mock` as a private package. Then Package settings →
Change visibility → Public:
https://github.com/users/martindzejky/packages/container/doklado-mock

### Publish v1.0.0

After this PR is on `master` and the npm trusted publisher is saved:

```sh
git checkout master
git pull
git tag v1.0.0
git push origin v1.0.0
```

That runs `.github/workflows/publish.yml`. Then make the GHCR package public if
the first image is still private. Do not create a GitHub Release by hand unless
you want one; the workflow only publishes npm and the image.

### Later versions

Bump `version` in `package.json` on `master`, merge, tag `vX.Y.Z`, and push the
tag. Both artifacts publish from that tag.

## Licence

MIT. See [LICENSE](./LICENSE).
