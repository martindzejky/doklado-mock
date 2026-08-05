# Doklado API behaviour

What the real Doklado API does, as far as we know it. This is the specification the
mock is built against.

Doklado has no sandbox, so the only ways to learn its behaviour are their OpenAPI
document and calls against production. Both were used. Their spec turned out to be
wrong in several places, so where the two disagree, **observed behaviour wins**.

Every statement below is tagged:

- **Observed.** Seen in a real response on 2026-08-05.
- **Inferred.** Taken from the spec, not yet confirmed against production.
- **Unknown.** Neither, flagged so it is not mistaken for fact.

A snapshot of their document lives in `spec/swagger.json` (version `2025.2.18`,
fetched 2026-08-05 from <https://api-doc.doklado.sk/swagger.json>). A scheduled job
re-fetches it and fails when it changes, so drift becomes visible.

## Scope

Doklado is document-collection and pre-accounting software. A business feeds receipts
and supplier invoices in, and the accountant's software pulls them out. Most of the
API serves that flow, which is why it mentions Pohoda, export flags and accounting
reference data.

Invoice issuing is a separate, later addition aimed at applications that create
invoices programmatically. That is the part this mock cares about. The
document-listing endpoints are here mainly so tests can read issued invoices back
through a real documented contract.

## Transport

**Observed.** Every endpoint is `POST` with `application/json`, on both the request
and the response. There are no `GET` routes, no path or query parameters, no
`multipart/form-data` and no binary bodies anywhere in the API. Files only ever travel
base64-encoded inside JSON, and only outward. Nothing can be uploaded.

Every request body is wrapped in a single `data` key:

```json
{ "data": { "organizationId": "12345678" } }
```

The one exception is `/v2/documents/setExported`, which nests a `documents` array
inside that wrapper.

Express serves the API behind a Google API Gateway. Responses carry `x-powered-by:
express`, `function-execution-id` and `server: Google Frontend`.

## Authentication

**Observed.** A single `api_key` request header. The tenant is `organizationId`, the
company's IČO, passed in the body of most endpoints rather than derived from the key.

Authentication failures do **not** use the normal response envelope, and the two
failure modes differ from each other:

| Case                               | Status | Body                                                      |
| ---------------------------------- | ------ | --------------------------------------------------------- |
| `api_key` header absent            | `403`  | `{"error":"Unauthorized!"}`                               |
| `api_key` header present but wrong | `401`  | `{"error":"You are not authorized to make this request"}` |

The `APP_UNAUTHENTICATED` code that their spec lists never came back.

## Response envelope

**Observed.** Successful calls return `success: true` alongside a `data` payload whose
type depends on the endpoint. Document listings return an array; issuing and PDF
retrieval return an object.

`code` is not exclusively an error field. An empty `unprocessed-documents` listing
returns `success: true` together with `code: "APP_NO_MORE_DATA"`.

## Errors

**Observed.** Application-level failures return **HTTP 200** with a body of exactly
two keys. There is no `data` key and no `message` key, despite the spec describing
`message` as an optional human-readable hint:

```json
{ "success": false, "code": "APP_INCORRECT_INPUT_DATA" }
```

Observed codes and their triggers:

| Code                         | Trigger                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `APP_INCORRECT_INPUT_DATA`   | Missing `data` wrapper, empty body, wrong field type, invalid enum value |
| `APP_ORGANIZATION_NOT_FOUND` | `organizationId` that does not exist                                     |
| `APP_NO_MORE_DATA`           | Empty result set, returned with `success: true`                          |

Note that the spec calls the second one `APP_ORGANIZATION_NOT_FOUND_CODE`. Production
drops the suffix.

Two cases escape the envelope entirely. Malformed JSON returns **HTTP 400** with an
Express HTML error page rather than JSON. Authentication failures behave as described
above.

**Unknown.** Whether `APP_MAX_EXPORT_LIMIT_EXCEEDED`, `APP_READ_DATA_ERROR` or
`SAVE_DATA_ERROR_CODE` are still emitted, and what triggers them.

## Unknown fields are ignored

**Observed.** Sending an undocumented field alongside valid ones succeeds normally,
and the field is silently dropped. The API does not reject unrecognised input.

The mock matches this. Rejecting a request that production would accept is worse than
accepting one it would reject, because it blocks work that would actually ship. The
request log flags unknown fields as a warning instead, so typos stay visible without
being fatal.

## Documents

### `organizationId` means two different things

**Observed, and the easiest mistake to make.** In a _request_, `organizationId` is
your own IČO and selects the tenant. In a returned document, `organizationId`,
`organizationName`, `organizationTaxId`, `organizationVatId` and `address` all
describe the **counterparty**, meaning the customer on an issued invoice and the
supplier on a received one. They are empty strings when the counterparty is a private
individual.

The document's `email` field is a third thing again. It holds the issuer's contact
address as printed on the PDF. Supplying `customer.contactEmail` when issuing does not
populate it, and Doklado falls back to the account's own address.

### Type and subtype

**Observed.** `type` is `invoice` or `receipt`. `subType` is more granular, and is a
union of three enums that their spec models as only one:

| Family          | Values seen                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Issued          | `domestic_exposed`, `foreign_exposed`                                                                 |
| Received        | `domestic_received`, `foreign_received`, `domestic_credit`, `foreign_credit`, `tax_document_received` |
| Manual receipts | `manual_domestic_received`, `manual_foreign_received`                                                 |

"Exposed" means issued. It reads like a literal translation of the Slovak
_vystavená_.

The `resourceSubType` request filter does not take these values. It takes
`issued_invoice` or `received_invoice` and selects the whole family. `resourceTypes`
takes `invoice` or `receipt`, where receipts turn out to be the `manual_*` subtypes.

**Inferred.** An issued invoice becomes `domestic_exposed` or `foreign_exposed` based
on the customer's country relative to the organisation's. We have only seen the
domestic case.

### Field shapes

**Observed.** Absent values are empty strings, never `null`. Nested objects such as
`accountingSettings`, `address` and `paymentInfo` follow the same rule.

Which keys are present varies between documents. `internalNote` appeared on an
API-issued invoice but not on older ones, and
`accountingSettings.classificationKVVat` did the reverse. Consumers cannot assume a
fixed key set.

Line items are usually absent. Across a sample of fifty documents, forty-five had an
empty `items` array, because scanned and imported documents carry no parsed lines.
Invoices created through `invoice-issue` do have them.

### Item `price` is a line total

**Observed, and a genuine trap.** Issuing with `unitPriceWithoutVat: 2` and
`quantity: 3` returns an item with `price: 6`. The request field is a unit price. The
response field is the extended line total. They are different concepts under similar
names.

Doklado computes both `vatAmount` on an item and `vatSummary` on the document rather
than echoing the request. `vatSummary` groups by rate and carries `taxBase`,
`vatAmount`, `vatRate` and `isTaxExempt`.

### Dates

**Observed.** Dates come back as ISO 8601 with milliseconds in UTC. Date-only input
such as `2026-08-05` returns as `2026-08-05T00:00:00.000Z`. Older documents from other
ingestion paths sit at `T12:00:00.000Z` instead, so midday normalisation exists
somewhere in their system but not on the issuing path.

`createdAt` is a true timestamp. When `taxPointDate` is not supplied, Doklado fills it
with the moment of creation rather than a normalised date.

### Currency

**Observed.** `currency` and `totalPrice` are the document's own. `otherCurrency` and
`otherTotalPrice` are the same amount converted to the organisation's home currency,
with `exchangeRate` alongside. For a EUR document in a EUR organisation the values
match and the rate is `1`.

### Pagination

**Observed.** Page size is fixed at 50 and there is no parameter to change it.

`searchAfter` in a response is a **single-element array holding the last document
id**, not the `[timestamp, id]` pair their spec's example shows. Passing it back
returns the next page. A deprecated `continuationToken` string comes back in parallel
and appears to carry the same id.

**Unknown.** What the final page looks like. `searchAfter` might become null or
absent, or an empty `data` array with `APP_NO_MORE_DATA` might terminate it.

### Filters

**Observed.** Doklado accepts `resourceTypes`, `resourceSubType`, `orderBy`,
`orderByDescending` and `isExported`, and rejects invalid enum values with
`APP_INCORRECT_INPUT_DATA`.

**Unknown.** Whether `isExported` actually filters. Both `true` and `false` returned a
full page of 50, and documents never carry an `isExported` field, so we could not
confirm the effect. We did not test the date filters.

## Issuing an invoice

`POST /v1/documents/invoice-issue`

**Observed.** Returns both the id and the resulting number:

```json
{
  "success": true,
  "data": { "documentId": "<id>", "invoiceNumber": "TEST-0001" }
}
```

Their spec documents this as `data.document` containing only an id. That is wrong in
both the field name and the contents.

Document ids are 20-character mixed-case alphanumeric strings, which look like
Firestore identifiers.

**Observed.** An explicit `number` is accepted as given and does not draw from the
organisation's numbering series.

**Inferred.** When `number` is omitted, the number comes from the numeric code
configured for that document type, in a `YYYYNNN` form. Real invoices in the account
look like `2026017`, under a series named _Vystavené faktúry_. We did not test this,
because it would consume a number from a live sequence.

**Observed.** Doklado derives the variable symbol from the digits of the invoice
number when `paymentInfo.variableSymbol` is omitted. `TEST-0001` produced
`vs: "0001"`.

**Observed.** With `paymentType: "card"` and no IBAN, the returned `paymentInfo`
contains only `bic` and `vs`.

**Observed.** The `note` field populates both `note` and `customText` on the document.

### Payment status

**Observed, and unintuitive.** `paid: true` records a payment for the total _as it
stands at issue time_. It does not track later changes. After an update took an
invoice from a total of 1 to a total of 6, `paymentStatus` changed from `paid` to
`partially_paid` on its own. The recorded payment no longer covered the new total.

## Updating an issued invoice

`POST /v1/documents/issued-invoice-update`

**Observed.** Takes the same field set as issuing, with everything optional, addressed
by `documentId`. Returns `{ "success": true, "data": { "documentId": "<id>" } }`.
Unlike issuing, there is no `invoiceNumber`.

Supplying `items` replaces the array wholesale, and Doklado recomputes totals and
`vatSummary`.

## Invoice PDF

`POST /v1/documents/get-invoice-pdf`

**Observed.** Returns the file base64-encoded inside JSON rather than as a binary
body:

```json
{
  "success": true,
  "data": {
    "Content-Type": "application/pdf",
    "encoding": "base64",
    "data": "<base64>"
  }
}
```

Note the capitalised `Content-Type` key. Decoded output is a single-page PDF 1.3, 60
to 80 kB, with subsetted embedded fonts.

**Inferred.** `language` on the invoice controls the PDF language, Slovak by default.

## Sending by email

`POST /v1/documents/send-invoice-by-email`

**Inferred.** Generates the PDF and sends it through Brevo to `recipients`, with
optional `subject`, `message`, `template`, `cc` and `bcc`. Returns the bare envelope
with no data.

We deliberately did not test this. It sends real mail to real people, a side effect
outside the Doklado account. The mock records these calls and never sends anything.

## Export flags

`POST /v2/documents/setExported`

**Observed.** `status` must come from a narrow enum of `not_exported`,
`sync_with_acc_soft`, `sync_with_acc_soft_failed`,
`sync_with_acc_soft_without_attachment` and
`sync_with_acc_soft_ok_attachment_failed`. Doklado rejects plausible-looking values
such as `success`.

Returns a per-document result array:

```json
{
  "success": true,
  "data": { "results": [{ "documentId": "<id>", "success": true }] }
}
```

Their spec does not describe this `results` wrapper.

## Attachments

`POST /v2/documents/attachments/get`

**Observed.** `documentType` accepts only `expense` or `unprocessed_document`.
Passing `invoice` fails with `APP_INCORRECT_INPUT_DATA`.

Returns `documentId`, `downloadUrl`, `fileName` and `fileType` of `primary` or
`secondary`. Download URLs are long signed links, presumably short-lived.

Nothing in the API can create an attachment, so issued invoices never have any.

## Unprocessed documents

`POST /v1/unprocessed-documents`

**Observed.** With nothing in the queue, returns `success: true`,
`code: "APP_NO_MORE_DATA"` and `data: []`, an empty **array**. Their spec describes
`data` as an object with `totalDocuments`, `notApprovedDocuments` and `documents`.

**Unknown.** Which of the two shapes appears when the queue is not empty.

Documents can only enter this queue through Doklado's own upload, email forwarding or
mobile app. There is no API route in.

## Endpoints not implemented

`/v1/documents`, `/v1/documents/setExported` and `/v1/documents/getAttachments` are
superseded by `/v2` equivalents.

Both versions of `/organization/accounting-settings/import` exist so accounting
software can push its own reference data into Doklado, things like numbering series,
cost centres and VAT classifications. No application issuing invoices needs it. You
configure numbering series in the Doklado web interface instead, and the mock
represents that configuration in its own config file.

## Open questions

Worth resolving next time there is a reason to touch production:

- How pagination terminates on the final page.
- Whether `isExported` filters, and why documents never expose the flag they are
  filtered by.
- Whether date filters behave as documented.
- What an omitted invoice number produces, and the exact numbering format.
- The shape of `unprocessed-documents` when the queue is not empty.
- Whether `foreign_exposed` follows from customer country, currency, or both.
