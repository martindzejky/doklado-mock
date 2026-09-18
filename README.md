# doklado-mock

A fake [Doklado](https://doklado.com/sk) you can run on your laptop, so you can build
an invoicing integration without touching real accounting data.

Doklado ships no sandbox. There is only production, where every issued invoice is a
real numbered document in someone's books. This fills that gap the way
[maildev](https://github.com/maildev/maildev) does for email. Run it locally, point
your application at it instead of the real service, and watch what your code sends in
a small web interface. State lives in memory and disappears on restart.

In production you change one environment variable back to the real Doklado gateway.
Nothing else in your application changes.

## Run it

Node 24 and pnpm 11.7.0. Copy the example config if you want to edit organisations,
series, or API keys:

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

`npx doklado-mock --help` prints the same flags. Point your app at the mock with one
env var:

```sh
DOKLADO_API_URL=http://127.0.0.1:3000
```

The accepted `api_key` header value is `test-api-key` unless you change the config.
The example organisation IČO is `12345678`.

Docker:

```sh
docker compose up --build
```

The inspector and `__mock` controls have no `api_key`. They are for local use.
Docker still binds `0.0.0.0` inside the container; the bin defaults to `127.0.0.1`.

## What it covers

Two Doklado endpoints:

- `POST /v1/documents/invoice-issue`
- `POST /v1/documents/get-invoice-pdf`

Plus a small inspector UI for the request log and issued invoices, and `__mock`
controls so tests can reset, seed, and inject faults. Unknown `/v1` and `/v2` paths
are logged and answered with Doklado's 403 shape.

A fuller eight-endpoint mock was designed and then shelved. See
[PLAN.full-mock.md](./PLAN.full-mock.md) if that comes back.

## `__mock` controls

No `api_key`. JSON only.

| Path                 | Role                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /__mock/reset` | Clear state; counters back to config                                                                                  |
| `POST /__mock/seed`  | Load fixtures and/or series counters                                                                                  |
| `POST /__mock/fault` | Force an error, status, or latency. `afterSuccess: true` creates the invoice first, then delays or fails the response |
| `GET /__mock/state`  | Snapshot for tests                                                                                                    |
| `GET /__mock/events` | SSE of store changes                                                                                                  |

## Documentation

- **[BEHAVIOUR.md](./BEHAVIOUR.md)** records how the real API behaves and where its
  published specification is wrong. The mock is built against it.
- **[PLAN.md](./PLAN.md)** is the active implementation plan.
- **[spec/swagger.json](./spec/swagger.json)** is a vendored snapshot of Doklado's
  OpenAPI document, checked for drift on a schedule.
- **[PLAN.full-mock.md](./PLAN.full-mock.md)** is the archived ten-phase plan for a
  fuller mock. Not the active scope.

## Credentials

The mock needs none. It is a fake Doklado and never talks to the real one.

The keys in [.env.example](./.env.example) exist only for the scripts that record real
API responses. Those hit production, so they are read-only by default.

## Licence

MIT. See [LICENSE](./LICENSE).
