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

## Status

Early. Behaviour is documented. The server is not built yet. Active plan:
[PLAN.md](./PLAN.md).

## What it covers

Two Doklado endpoints, matching what `blizsiekdetom.sk` needs:

- Issue an invoice
- Fetch that invoice's PDF

Plus a small inspector UI for the request log and issued invoices, and `__mock`
controls so tests can reset, seed, and inject faults. Unknown `/v1` and `/v2` paths
are logged and answered with Doklado's 403 shape.

A fuller eight-endpoint mock was designed and then shelved. See
[PLAN.full-mock.md](./PLAN.full-mock.md) if that comes back.

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
