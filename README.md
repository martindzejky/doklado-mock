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

Early. The API behaviour is documented, the server is not built yet. See
[BEHAVIOUR.md](./BEHAVIOUR.md).

## What it covers

Invoice issuing, plus the endpoints needed to read issued invoices back:

- Issue an invoice, and update an issued one
- Fetch the invoice PDF
- Send an invoice by email, recorded rather than sent
- List documents, with filtering, ordering and pagination
- Mark documents exported

Attachments and the unprocessed-document queue answer in the correct shape but stay
empty, because nothing in Doklado's API can populate them.

## Documentation

- **[BEHAVIOUR.md](./BEHAVIOUR.md)** records how the real API behaves and where its
  published specification is wrong. The mock is built against it.
- **[spec/swagger.json](./spec/swagger.json)** is a vendored snapshot of Doklado's
  OpenAPI document, checked for drift on a schedule.
- **[PLAN.full-mock.md](./PLAN.full-mock.md)** is an archived ten-phase plan for a
  fuller eight-endpoint mock. Kept for later; not the active scope.

## Credentials

The mock needs none. It is a fake Doklado and never talks to the real one.

The keys in [.env.example](./.env.example) exist only for the scripts that record real
API responses. Those hit production, so they are read-only by default.

## Licence

MIT. See [LICENSE](./LICENSE).
