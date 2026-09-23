# Doklado API behaviour

What the real Doklado API does, as far as we know it. This is the specification the
mock is built against.

Doklado has no sandbox, so the only ways to learn its behaviour are their OpenAPI
document and calls against production. Both were used. Their spec turned out to be
wrong in several places, so where the two disagree, **observed behaviour wins**.

Every statement below is tagged:

- **Observed.** Seen in a real response on 2026-08-05, unless the section names a
  later date.
- **Inferred.** Taken from the spec, not yet confirmed against production.
- **Unknown.** Neither, flagged so it is not mistaken for fact.

A snapshot of their document lives in `spec/swagger.json` (info.version still
`2025.2.18`, fetched 2026-09-19 from <https://api-doc.doklado.sk/swagger.json>).
A scheduled job re-fetches it and fails when the bytes change, so drift becomes
visible.

The 2026-09-19 refresh did not change `POST /v1/documents/invoice-issue`,
`POST /v1/documents/get-invoice-pdf`, or any schema those two `$ref`. Shared
paths other than two listing request bodies were also unchanged. The live
document grew by eight paths and twenty schemas. Those additions, and the
listing-filter edits, are **Inferred** from the spec. They are not observed
production behaviour. Details sit with the endpoints they belong to. The mock
still implements only the two issuing routes.

## Scope

Doklado is document-collection and pre-accounting software. A business feeds receipts
and supplier invoices in, and the accountant's software pulls them out. Most of the
API serves that flow, which is why it mentions Pohoda, export flags and accounting
reference data.

This file is **production research**. It records how the real API behaves, including
endpoints this mock does not implement.

Invoice issuing is a separate, later addition aimed at applications that create
invoices programmatically. That is the part this mock cares about. **The mock
implements two endpoints:** `POST /v1/documents/invoice-issue` and
`POST /v1/documents/get-invoice-pdf`. Unknown `/v1` and `/v2` paths, including
document listing, update, email, attachments, export flags, and the 2026-09-19
additions (`/v2/documents/get`, `/v2/documents/changes`, bank transactions), are
logged and return Doklado's 403 `{"error":"Unauthorized!"}`. `/v3` organisation
management paths are also unimplemented. They are not on the v1/v2 catch-all, so
they currently 404 like any other unknown Kit route. Production `/v3` error
shapes are **Unknown**. Extra endpoints are documented below because they
explain the published spec, not because the mock serves them.

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

**Observed.** Application-level failures return **HTTP 200** and come in **four
different body shapes**. Worse, a single endpoint emits several of them depending on
which validation layer rejected the request. `invoice-issue` alone produces all four.

The bare form carries nothing but the code. Document listing and export flags use it:

```json
{ "success": false, "code": "APP_INCORRECT_INPUT_DATA" }
```

The schema form is Zod's treeified output, `data.errors` for whole-object problems
and `data.properties` keyed by field name:

```json
{
  "success": false,
  "code": "APP_INCORRECT_INPUT_DATA",
  "data": {
    "errors": [],
    "properties": {
      "organizationId": {
        "errors": ["Invalid input: expected string, received undefined"]
      }
    }
  }
}
```

Sometimes `data.errors` is populated instead and `properties` is missing entirely,
as with `["Invalid input: expected iban, received undefined"]`. Both are Zod output,
so a Zod layer sits in front of the issuing endpoints. These messages name the
offending field, which makes them the only useful diagnostics in the whole API. Do
not parse them. They are library output and change when Doklado bumps a dependency.

The business-rule form uses `message`, the key the spec calls an optional hint:

```json
{
  "success": false,
  "code": "APP_INCORRECT_INPUT_DATA",
  "message": "Invoice number doesnt match numeric code format"
}
```

The conflict form returns structured detail about what you collided with:

```json
{
  "success": false,
  "code": "APP_DOCUMENT_ALREADY_EXISTS",
  "data": {
    "expenseId": "<id of the existing document>",
    "invoiceType": "domestic_exposed",
    "invoiceNumber": "TEST-2026001",
    "supplierName": "<your organisation>",
    "customerName": "<customer on the existing document>"
  }
}
```

Note `expenseId` naming the id of an issued invoice.

So `APP_INCORRECT_INPUT_DATA` alone can arrive with no detail, with a Zod tree, or
with a `message`, and there is no field telling you which to expect. The mock
reproduces the right shape per failure, because a client written against one of them
will crash on the others.

Observed codes and their triggers:

| Code                          | Trigger                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `APP_INCORRECT_INPUT_DATA`    | Missing `data` wrapper, empty body, wrong field type, invalid enum value, unknown numeric code, number not matching the mask |
| `APP_ORGANIZATION_NOT_FOUND`  | `organizationId` that does not exist                                                                                         |
| `APP_DOCUMENT_ALREADY_EXISTS` | Issuing with a `number` another document already has                                                                         |
| `APP_NO_MORE_DATA`            | Empty result set, returned with `success: true`                                                                              |

Note that the spec calls the second one `APP_ORGANIZATION_NOT_FOUND_CODE`. Production
drops the suffix. It does not document the third at all.

Two cases escape the envelope entirely. Malformed JSON returns **HTTP 400** with an
Express HTML error page rather than JSON. Authentication failures behave as described
above.

**Unknown.** Whether `APP_MAX_EXPORT_LIMIT_EXCEEDED`, `APP_READ_DATA_ERROR` or
`SAVE_DATA_ERROR_CODE` are still emitted, and what triggers them. The 2026-09-19
spec newly documents `APP_INSUFFICIENT_PERMISSIONS` on `/v2/documents/changes`.
We have not seen that code in production.

## Unknown fields are ignored

**Observed.** Sending an undocumented field alongside valid ones succeeds normally,
and the field is silently dropped. The API does not reject unrecognised input.

The mock matches this. Rejecting a request that production would accept is worse than
accepting one it would reject, because it blocks work that would actually ship. The
request log flags unknown fields as a warning instead, so typos stay visible without
being fatal.

## Documents

Listing, paging, and filters below are **observed production behaviour**. This mock
does not implement document-listing endpoints.

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

**Observed.** The customer's country decides `domestic_exposed` against
`foreign_exposed`, and currency has nothing to do with it. A Czech customer billed in
EUR came back `foreign_exposed`. A Slovak customer billed in CZK came back
`domestic_exposed`.

**Observed.** The `type` request field takes `issued_invoice`, `issued_credit`,
`issued_debit`, `issued_advance` or `issued_tax_document`. That list is not in the
spec. It leaked out of a Zod error message.

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

The document number is `invoiceNumber`, even on receipts, and the request field that
sets it is `number`. A second field `originalNumber` exists and was empty on every
document we saw.

### Item `price` is a gross line total

**Observed, and a genuine trap.** You send `unitPriceWithoutVat`, a net unit price.
You get back `price`, the **gross line total**, quantity multiplied in and VAT added.
Different concepts, similar names, no warning.

An earlier round of testing recorded this as a net line total, because the test used
a 0% rate where net and gross are identical. Watch for that if you go checking.

Worked example. Sending `unitPriceWithoutVat: 10.336`, `vatRate: 23`, `quantity: 1.5`
returns:

```json
{ "price": 19.07, "vatAmount": 3.57, "quantity": 1.5, "vatRate": 23 }
```

The net line is 15.504, VAT on it is 3.566, and 19.074 rounds to 19.07.

Rounding is half-up to two decimals, applied per item. `totalPrice` on the document
is the sum of those already-rounded item grosses.

`vatSummary` groups by rate, and computes from the **unrounded** net sums rather than
from the rounded item figures. Two 23% lines of 15.504 and 0.015 produced
`taxBase: 15.52`, where rounding each line first would have given 15.50. So the
document's own numbers are internally inconsistent by a cent in the general case, and
you cannot reconstruct `vatSummary` from the items you can see.

An entry exists for every rate present, including 0%, which comes back with
`isTaxExempt: false`.

### Dates

**Observed.** Dates come back as ISO 8601 with milliseconds in UTC. Date-only input
such as `2026-08-05` returns as `2026-08-05T00:00:00.000Z`. Older documents from other
ingestion paths sit at `T12:00:00.000Z` instead, so midday normalisation exists
somewhere in their system but not on the issuing path.

`createdAt` is a true timestamp. Every date you omit gets filled with the moment of
creation rather than with a normalised date, so an invoice issued without
`issueDate` has `issuedAt` of `2026-08-05T06:29:21.350Z`. Omitting `dueDate` gives a
due date accurate to the millisecond, which is nonsense but harmless. `taxPointDate`
behaves the same way and cannot be avoided, since no request field sets it.

The request field `issueDate` appears on the document as `issuedAt`. `dueDate` and
`deliveryDate` keep their names.

### Currency

**Observed.** `currency` and `totalPrice` are the document's own. `otherCurrency` and
`otherTotalPrice` are the same amount converted to the organisation's home currency,
with `exchangeRate` alongside. For a EUR document in a EUR organisation the values
match and the rate is `1`.

A 1 CZK invoice in a EUR organisation returned `exchangeRate: 24.2` and
`otherTotalPrice: 0.04`, so the conversion divides by the rate and rounds to two
decimals. Doklado picks the rate itself and there is no way to supply one.

### Pagination

**Observed.** Page size is fixed at 50 and there is no parameter to change it.

`searchAfter` and the deprecated `continuationToken` sit at the **top level of the
response**, as siblings of `data`, not inside it. `searchAfter` is a
**single-element array holding the last document id**, not the `[timestamp, id]`
pair their spec's example shows. Passing it back returns the next page.
`continuationToken` appears to carry the same id as a bare string.

**Observed.** Paging through 211 documents took six requests and terminates like
this:

| Request | `data`  | `code`             | `searchAfter`  |
| ------- | ------- | ------------------ | -------------- |
| 1 to 4  | 50 docs | absent             | present        |
| 5       | 12 docs | absent             | present        |
| 6       | `[]`    | `APP_NO_MORE_DATA` | **key absent** |

Two traps here. A short page does **not** mean the end, so stopping when `data` has
fewer than 50 entries silently drops the tail. And the terminating response drops
the `searchAfter` and `continuationToken` keys rather than nulling them, so the
right loop condition is the presence of the key, not its value. No document
appeared twice across the six pages.

### Filters

**Observed.** Doklado accepts `resourceTypes`, `resourceSubType`, `orderBy`,
`orderByDescending` and `isExported`, and rejects invalid enum values with
`APP_INCORRECT_INPUT_DATA`.

`orderBy` takes `delivery_date`, `issue_date` or `creation_date`. It does not take
the field names that appear on documents, so the obvious guess `createdAt` fails.
`unprocessed-documents` accepts the same parameter minus `issue_date`.

**Unknown.** Whether `isExported` actually filters. Both `true` and `false` returned a
full page of 50, and documents never carry an `isExported` field, so we could not
confirm the effect. We did not test the date filters.

**Inferred.** The 2026-09-19 spec adds an optional `approvalStatus` array filter
on `/v2/documents` and `/v1/unprocessed-documents`, with values `default`,
`rejected`, `approved`, `returned`. `ApprovalStatus` already existed on returned
documents in the previous snapshot. Using it as a list filter is new in the spec.
We have not sent it. The mock does not implement listing.

**Unknown.** The unprocessed-documents `dateType` enum in the spec changed from
`create`/`issue` to `create`/`delivery`. We never tested date filters, so we do
not know which pair production accepts. A spec edit is not evidence that
production changed.

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

**Observed.** Only four fields are required: `organizationId`, `type`, `items` and
`customer`. `issueDate`, `dueDate`, `deliveryDate` and `currency` are all optional
and default as described under Dates and Currency. Currency defaults to EUR, which
is presumably the organisation's own rather than a constant.

### `customer.countryCode`

**Observed** on 2026-09-23. `POST /v1/documents/invoice-issue` returned HTTP 200
for `customer.countryCode: "SK"`. `success` is false, `code` is
`APP_INCORRECT_INPUT_DATA`, and both messages sit on
`data.properties.customer.properties.countryCode`. The complete body is
`spec/observations/2026-09-23-invoice-issue-country-code-sk.json`.

Those two messages are alternative checks on the same field. The first names a
lowercase country-code enum. The second expects the literal `"other"`. They do
not describe two invalid fields.

**Observed** on 2026-09-23. A later call to the same endpoint with
`customer.countryCode: "sk"` issued an invoice.

**Inferred** from the `"SK"` rejection, not from a successful production call.
The messages also name the rest of that lowercase list and the literal
`"other"`. `"other"` has not been confirmed by a successful issue.

The mock accepts a lowercase code from that list, or `"other"`, and rejects any
other string. Uppercase and mixed case fail as sent. The field may still be
omitted or `null`, because this call does not say what production does with
those.

**Observed.** Doklado derives the variable symbol from the digits of the invoice
number when `paymentInfo.variableSymbol` is omitted. `TEST-0001` produced
`vs: "0001"`.

**Observed.** `paymentType` takes `cash`, `card`, `transfer` or `cash_on_delivery`.
`transfer` additionally requires `paymentInfo.iban` and fails without it. `card`
needs nothing extra, and the returned `paymentInfo` then contains only `bic` and
`vs`.

**Observed.** The `note` field populates both `note` and `customText` on the
document.

### Numbering series, and the bug in them

A numbering series is a numeric code in Doklado's vocabulary. You configure them in
the web interface with a name, a format mask, a reset period and a counter, and you
tick one as default per invoice type.

**Observed.** Omitting `number` draws from a series and returns the result as
`invoiceNumber`. A mask of `#RRRRCCC` produced `2026034`, so `RRRR` is the year and
`CCC` is a counter zero-padded to three digits, concatenated with no separator.

**Observed, and this is the bug.** Doklado issues from the wrong series. We created
a second series named _TESTOVACÍ RAD_ with the mask `#TEST-#RRRRCCC`, ticked it as
default for issued invoices, and confirmed after a page reload that the interface
showed it as the only default and the previous series as unticked. An invoice issued
with `number` omitted still came back as `2026034`, from the old series. The document
read back with `accountingSettings.numericCode.name` of _Vystavené faktúry_, naming
the series it actually used.

So the default flag in the interface does not decide what the API issues from. What
does decide it is unknown. Creation order and the fact that the old series is the
one with prior invoices are both plausible, and we have no way to distinguish them
from outside.

**Consequence.** You cannot test auto-numbering against a throwaway series. Doklado
ignores the flag and takes a number from your live sequence instead. That is what
makes the bug matter: the normal integration omits `number` precisely so invoices
join the organisation's real sequence, and that is exactly the path you cannot
rehearse safely.

**Mock decision.** This mock issues from the series marked `default` in config. Faking
the production bug would invent a rule we never isolated. That difference is
recorded in `src/lib/server/doklado/deviations.ts`.

**Observed, and the one merciful behaviour here.** Deleting an issued invoice in the
web interface rolls the counter back. After deleting invoice `2026034` the series
returned to next-value 34. Numbers are not burned permanently, which is what makes
probing production survivable at all.

### Targeting a series with `numericCodeId`

**Observed.** `accountingSettings.numericCodeId` overrides the broken default and
picks a series reliably. The name is a lie. It is not an id. It is the series'
**export abbreviation**, the field the web interface labels _Hodnota číselného radu
pre export_ in the edit dialog and _Skratka_ in the list.

Doklado's own internal ids do not work here. We tried the real id of the series
Doklado was actively issuing from and got `"Incorrect numeric code"`, the same
response as for a string of nonsense. The abbreviation is blank by default, so on a
fresh organisation there is no working value at all until somebody types one in.
That fits the feature's origin: numeric codes were built for accounting software
pushing its own identifiers in through `accounting-settings/import`, and the
abbreviation is the pairing key.

Setting the abbreviation to `TESTRADEXPORT` and sending
`accountingSettings: { "numericCodeId": "TESTRADEXPORT" }` issued `TEST-2026001`
from the intended series.

**This is a testing tool, not an integration one.** An application that wants its
invoices in the organisation's normal sequence should omit both `number` and
`numericCodeId` and accept the default, bug and all. Use `numericCodeId` to point
probes at a scratch series.

### Explicit numbers move the counter

**Observed, and the sharpest edge in the whole API.** An explicit `number` does not
sit outside the series. Doklado parses it and resumes counting from it.

| Step | Request                  | Result         |
| ---- | ------------------------ | -------------- |
| 1    | no `number`              | `TEST-2026001` |
| 2    | no `number`              | `TEST-2026002` |
| 3    | `number: "TEST-2026500"` | `TEST-2026500` |
| 4    | no `number`              | `TEST-2026501` |

One invoice with a high explicit number permanently jumps the sequence for every
invoice after it. Anything that mixes explicit and automatic numbering against the
same series will produce gaps.

### The mask is validated, but only sometimes

**Observed.** When you send `numericCodeId`, the `number` must match that series'
format mask, or you get
`{"message": "Invoice number doesnt match numeric code format"}`. `TEST-8001` failed
against the mask `#TEST-#RRRRCCC`.

When you do not send `numericCodeId`, no such check happens. `TEST-0001` was accepted
against an organisation whose only series used the mask `RRRRCCC`, which it plainly
does not match. Whether your invoice number is validated depends on whether you
mentioned an unrelated field.

### Duplicate numbers

**Observed.** Issuing with a `number` that already exists fails with
`APP_DOCUMENT_ALREADY_EXISTS` and returns details of the document you collided with.
See the conflict form under Errors. Numbers are unique across the organisation, not
per series.

### On the quality of all this

Worth saying plainly, because it shapes how much the mock should trust the spec.
This API is bad, and not in small ways. The default-series flag does not work.
Errors arrive in four incompatible shapes from the same endpoint. `organizationId`
means your company in a request and the counterparty in a response. Item `price` is
a net unit price going in and a gross line total coming out. A field named
`numericCodeId` takes an abbreviation rather than an id, and rejects the actual id.
Whether your invoice number gets validated depends on whether you sent an unrelated
field. `data` changes between array and object depending on how many results there
are. Omitted dates default to the current millisecond. An issued invoice's id is
called `expenseId` in one response. Half the documented response schemas do not
match production, and the spec was clearly written once and left behind.

None of that is fixable from here, so the mock encodes the real behaviour, including
the bugs. A mock that behaves better than production would hide exactly the problems
it exists to surface.

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
outside the Doklado account. This mock does not implement the endpoint. Those
requests hit the catch-all, are logged, and return 403. Nothing is sent.

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

The request takes a `requestDocumentsAttachments` array of `documentId` and
`documentType` pairs. `data` comes back as a flat array with one entry per
attachment, not grouped by document and not wrapped in a `results` object the way
`setExported` does:

```json
{
  "success": true,
  "data": [
    {
      "documentId": "<id>",
      "downloadUrl": "<long signed url>",
      "fileName": "supplier_invoice_5119121",
      "fileType": "primary"
    }
  ]
}
```

`fileType` is `primary` or `secondary`. `fileName` carries no extension, so the
format has to come from the URL or the download itself. Download URLs are long
signed links, presumably short-lived.

Nothing in the API can create an attachment, so issued invoices never have any.

## Unprocessed documents

`POST /v1/unprocessed-documents`

**Observed, and genuinely awful.** `data` changes type depending on how many results
there are. Empty queue gives `success: true`, `code: "APP_NO_MORE_DATA"` and an empty
**array**. Non-empty gives the **object** their spec describes, with no `code`:

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "documentId": "<id>",
        "createdAt": "2026-08-05T05:42:41.121Z",
        "deliveryDate": "2026-07-03T00:00:00.000Z",
        "organizationName": "<supplier>",
        "totalPrice": 14.99,
        "currency": "USD",
        "createdBy": "<uploader email>"
      }
    ],
    "totalDocuments": 1,
    "notApprovedDocuments": 0
  },
  "searchAfter": ["<id>"]
}
```

A statically typed client cannot model that as one type. Anything consuming this has
to branch on the runtime type of `data` before touching it.

Paging works the same way as `/v2/documents`. Passing `searchAfter` back after the
last entry returns `success: true`, `code: "APP_NO_MORE_DATA"` and `data: []`, with
no `searchAfter` key. So the array form is really the terminal form, and the object
form appears whenever there are results.

Queue entries are far thinner than a `DocumentV2`, seven fields against thirty, and
`createdBy` exposes the email of whoever uploaded the file. Note `searchAfter` at the
top level again, same as `/v2/documents`.

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

The 2026-09-19 spec also documents these, all **Inferred** and unimplemented:

- `POST /v2/documents/get` fetches one document by `documentId`.
- `POST /v2/documents/changes` returns change history for up to ten documents, and
  is the first place the spec lists `APP_INSUFFICIENT_PERMISSIONS`.
- `POST /v1/organization/bank-transactions` returns transactions and balances.
- `POST /v3/organization/manage/create`, `list`, `update`, `assign-member`, and
  `accounting-settings/sync` manage organisations.

`/v1` and `/v2` unknowns still hit the catch-all and return 403. `/v3` is not on
that catch-all. We have not called production `/v3`, so we do not know the real
auth shape, and we are not inventing a 403 for it.

## Open questions

Worth resolving next time there is a reason to touch production:

- What Doklado actually uses to pick the default series, since it is not the default
  flag. Creation order and "the series with prior invoices" are both plausible.
- What happens to numbering under concurrent issuing. Everything here was sequential.
- Whether `isExported` filters, and why documents never expose the flag they are
  filtered by.
- Whether date filters behave as documented.
- Which shape each remaining endpoint uses for errors. Issuing produces all four,
  document listing only the bare one, and the rest are untested.
- What the other four `type` values do, and whether credit notes carry a reference
  to the invoice they correct.
- Whether listing `approvalStatus` actually filters.
- Which `dateType` values `/v1/unprocessed-documents` accepts after the spec
  changed from `issue` to `delivery`.
- What `/v3/organization/manage/*` returns for a missing or wrong `api_key`.
