# Doklado API behaviour

What the real Doklado API does, as far as we know it. This is the specification
doklado-mock is built against.

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

This mock implements `POST /v1/documents/invoice-issue` and
`POST /v1/documents/get-invoice-pdf`. Unknown `/v1` and `/v2` paths are logged and
answered with Doklado's missing-key 403. The rest of Doklado's API is out of this
mock; observations below are the ones that shape issuing, stored documents, and
PDFs.

## Transport

**Observed.** Every endpoint is `POST` with `application/json`, on both the request
and the response. There are no `GET` routes, no path or query parameters, no
`multipart/form-data` and no binary bodies anywhere in the API. Files only ever
travel base64-encoded inside JSON, and only outward.

Every request body is wrapped in a single `data` key:

```json
{ "data": { "organizationId": "12345678" } }
```

Express serves the API behind a Google API Gateway. Responses carry `x-powered-by:
express`, `function-execution-id` and `server: Google Frontend`.

The mock does not impersonate those gateway headers. It does reproduce POST-only
JSON and the `data` wrapper. Non-POST on the two document routes is treated like
an unknown path: logged, and answered with the missing-key 403 rather than a
framework 405. Wrong-method responses were never observed; that 403 is the closest
observed shape.

## Authentication

**Observed.** A single `api_key` request header. The tenant is `organizationId`, the
company's IČO, passed in the body rather than derived from the key.

Authentication failures do **not** use the normal response envelope, and the two
failure modes differ from each other:

| Case                               | Status | Body                                                      |
| ---------------------------------- | ------ | --------------------------------------------------------- |
| `api_key` header absent            | `403`  | `{"error":"Unauthorized!"}`                               |
| `api_key` header present but wrong | `401`  | `{"error":"You are not authorized to make this request"}` |

The `APP_UNAUTHENTICATED` code that their spec lists never came back.

## Response envelope

**Observed.** Successful calls return `success: true` alongside a `data` payload
whose type depends on the endpoint. Issuing and PDF retrieval return an object.

## Errors

**Observed.** Application-level failures return **HTTP 200** and come in **four
different body shapes**. Worse, a single endpoint emits several of them depending on
which validation layer rejected the request. `invoice-issue` produces all four.

The bare form carries nothing but the code. Empty body and a missing `data` wrapper
use it, as does an unknown organisation:

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

Observed codes and their triggers on the issuing path:

| Code                          | Trigger                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `APP_INCORRECT_INPUT_DATA`    | Missing `data` wrapper, empty body, wrong field type, invalid enum value, unknown numeric code, number not matching the mask |
| `APP_ORGANIZATION_NOT_FOUND`  | `organizationId` that does not exist                                                                                         |
| `APP_DOCUMENT_ALREADY_EXISTS` | Issuing with a `number` another document already has                                                                         |

Note that the spec calls the second one `APP_ORGANIZATION_NOT_FOUND_CODE`. Production
drops the suffix. It does not document the third at all.

Two cases escape the envelope entirely. Malformed JSON returns **HTTP 400** with an
Express HTML error page rather than JSON. Authentication failures behave as described
above.

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
describe the **counterparty**, meaning the customer on an issued invoice. They are
empty strings when the counterparty is a private individual.

The document's `email` field is a third thing again. It holds the issuer's contact
address as printed on the PDF. Supplying `customer.contactEmail` when issuing does
not populate it, and Doklado falls back to the account's own address.

### Type and subtype

**Observed.** On a stored issued invoice, `type` is `invoice`. `subType` is more
granular:

| Family | Values seen                           |
| ------ | ------------------------------------- |
| Issued | `domestic_exposed`, `foreign_exposed` |

"Exposed" means issued. It reads like a literal translation of the Slovak
_vystavená_.

**Observed.** The customer's country decides `domestic_exposed` against
`foreign_exposed`, and currency has nothing to do with it. A Czech customer billed
in EUR came back `foreign_exposed`. A Slovak customer billed in CZK came back
`domestic_exposed`.

**Observed.** The `type` request field takes `issued_invoice`, `issued_credit`,
`issued_debit`, `issued_advance` or `issued_tax_document`. That list is not in the
spec. It leaked out of a Zod error message.

### Field shapes

**Observed.** Absent values are empty strings, never `null`. Nested objects such as
`accountingSettings`, `address` and `paymentInfo` follow the same rule.

Which keys are present varies between documents. `internalNote` appeared on an
API-issued invoice but not on older ones. Clients cannot assume a fixed key set.

Invoices created through `invoice-issue` have line items.

The document number is `invoiceNumber`, and the request field that sets it is
`number`. A second field `originalNumber` exists and was empty on every document we
saw.

### Item `price` is a gross line total

**Observed, and a genuine trap.** You send `unitPriceWithoutVat`, a net unit price.
You get back `price`, the **gross line total**, quantity multiplied in and VAT
added. Different concepts, similar names, no warning.

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

`vatSummary` groups by rate, and computes from the **unrounded** net sums rather
than from the rounded item figures. Two 23% lines of 15.504 and 0.015 produced
`taxBase: 15.52`, where rounding each line first would have given 15.50. So the
document's own numbers are internally inconsistent by a cent in the general case, and
you cannot reconstruct `vatSummary` from the items you can see.

An entry exists for every rate present, including 0%, which comes back with
`isTaxExempt: false`.

### Dates

**Observed.** Dates come back as ISO 8601 with milliseconds in UTC. Date-only input
such as `2026-08-05` returns as `2026-08-05T00:00:00.000Z`. Older documents from
other ingestion paths sit at `T12:00:00.000Z` instead, so midday normalisation
exists somewhere in their system but not on the issuing path.

`createdAt` is a true timestamp. Every date you omit gets filled with the moment of
creation rather than with a normalised date, so an invoice issued without
`issueDate` has `issuedAt` of `2026-08-05T06:29:21.350Z`. Omitting `dueDate` gives a
due date accurate to the millisecond, which is nonsense but harmless. `taxPointDate`
behaves the same way and cannot be avoided, since no request field sets it.

The request field `issueDate` appears on the document as `issuedAt`. `dueDate` and
`deliveryDate` keep their names.

### Currency

**Observed.** `currency` and `totalPrice` are the document's own. `otherCurrency`
and `otherTotalPrice` are the same amount converted to the organisation's home
currency, with `exchangeRate` alongside. For a EUR document in a EUR organisation
the values match and the rate is `1`.

A 1 CZK invoice in a EUR organisation returned `exchangeRate: 24.2` and
`otherTotalPrice: 0.04`, so the conversion divides by the rate and rounds to two
decimals. Doklado picks the rate itself and there is no way to supply one.

The mock uses fixed rates from config so foreign-currency tests stay deterministic.

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
and default as described under Dates and Currency. Currency defaults to EUR in
the organisation we probed, which is presumably the organisation's home currency
rather than a constant. The mock uses the home currency from config.

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
ignores the flag and takes a number from your live sequence instead.

**Mock decision.** The mock issues from the series marked `default` in config. Faking
the production bug would invent a rule we never isolated. That difference is
recorded in `src/lib/server/doklado/deviations.ts`.

**Observed, and the one merciful behaviour here.** Deleting an issued invoice in the
web interface rolls the counter back. After deleting invoice `2026034` the series
returned to next-value 34. Numbers are not burned permanently.

### Targeting a series with `numericCodeId`

**Observed.** `accountingSettings.numericCodeId` overrides the broken default and
picks a series reliably. The name is a lie. It is not an id. It is the series'
**export abbreviation**, the field the web interface labels _Hodnota číselného radu
pre export_ in the edit dialog and _Skratka_ in the list.

Doklado's own internal ids do not work here. We tried the real id of the series
Doklado was actively issuing from and got `"Incorrect numeric code"`, the same
response as for a string of nonsense. The abbreviation is blank by default, so on a
fresh organisation there is no working value at all until somebody types one in.

Setting the abbreviation to `TESTRADEXPORT` and sending
`accountingSettings: { "numericCodeId": "TESTRADEXPORT" }` issued `TEST-2026001`
from the intended series.

An application that wants its invoices in the organisation's normal sequence should
omit both `number` and `numericCodeId` and accept the default. Use `numericCodeId`
to point probes at a scratch series. The mock's example config includes both a
default series (`FA`) and a test series (`TESTRADEXPORT`).

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

When you do not send `numericCodeId`, no such check happens. `TEST-0001` was
accepted against an organisation whose only series used the mask `RRRRCCC`, which it
plainly does not match. Whether your invoice number is validated depends on whether
you mentioned an unrelated field.

### Duplicate numbers

**Observed.** Issuing with a `number` that already exists fails with
`APP_DOCUMENT_ALREADY_EXISTS` and returns details of the document you collided with.
See the conflict form under Errors. Numbers are unique across the organisation, not
per series.

### Payment status

**Observed, and unintuitive.** `paid: true` records a payment for the total _as it
stands at issue time_. It does not track later changes. After an update took an
invoice from a total of 1 to a total of 6, `paymentStatus` changed from `paid` to
`partially_paid` on its own. The recorded payment no longer covered the new total.

The mock has no update route, so `paymentStatus` stays `paid` or `not_paid` as set
at issue. Unpaid uses the swagger enum value `not_paid`, not an invented `unpaid`.

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

The mock renders a one-page PDF with Slovak diacritics via `pdf-lib`, `fontkit`, and
Noto Sans. Fonts are embedded without subsetting, because the fontkit version in use
does not expose the stream encoder `pdf-lib` 1.17 uses for subsets. Same
`documentId` returns byte-identical output: clock and randomness come from the store,
not from each call.

## On the quality of all this

Worth saying plainly, because it shapes how much the mock should trust the spec.
This API is bad, and not in small ways. The default-series flag does not work.
Errors arrive in four incompatible shapes from the same endpoint. `organizationId`
means your company in a request and the counterparty in a response. Item `price` is
a net unit price going in and a gross line total coming out. A field named
`numericCodeId` takes an abbreviation rather than an id, and rejects the actual id.
Whether your invoice number gets validated depends on whether you sent an unrelated
field. Omitted dates default to the current millisecond. An issued invoice's id is
called `expenseId` in one response. Half the documented response schemas do not
match production, and the spec was clearly written once and left behind.

None of that is fixable from here, so the mock encodes the real behaviour, including
the bugs. A mock that behaves better than production would hide exactly the problems
it exists to surface. The one intentional difference is the default numbering
series, recorded in `src/lib/server/doklado/deviations.ts`.
