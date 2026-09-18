import { jsonResponse } from './envelope';

export const APP_INCORRECT_INPUT_DATA = 'APP_INCORRECT_INPUT_DATA';
export const APP_ORGANIZATION_NOT_FOUND = 'APP_ORGANIZATION_NOT_FOUND';
export const APP_DOCUMENT_ALREADY_EXISTS = 'APP_DOCUMENT_ALREADY_EXISTS';

/** BEHAVIOUR.md Authentication: missing api_key header. */
export function missingApiKey(): Response {
  return jsonResponse({ error: 'Unauthorized!' }, 403);
}

/** BEHAVIOUR.md Authentication: header present but wrong. */
export function wrongApiKey(): Response {
  return jsonResponse(
    { error: 'You are not authorized to make this request' },
    401,
  );
}

/** BEHAVIOUR.md Errors: bare form. */
export function bareError(code: string): Response {
  return jsonResponse({ success: false, code });
}

/** BEHAVIOUR.md Errors: Zod tree form. */
export function schemaError(tree: unknown): Response {
  return jsonResponse({
    success: false,
    code: APP_INCORRECT_INPUT_DATA,
    data: tree,
  });
}

/** BEHAVIOUR.md Errors: business-rule form with message. */
export function messageError(
  message: string,
  code = APP_INCORRECT_INPUT_DATA,
): Response {
  return jsonResponse({ success: false, code, message });
}

export type ConflictDocument = {
  documentId: string;
  subType: string;
  invoiceNumber: string;
  supplierName: string;
  customerName: string;
};

/** BEHAVIOUR.md Errors: conflict form. expenseId names an issued invoice. */
export function alreadyExists(document: ConflictDocument): Response {
  return jsonResponse({
    success: false,
    code: APP_DOCUMENT_ALREADY_EXISTS,
    data: {
      expenseId: document.documentId,
      invoiceType: document.subType,
      invoiceNumber: document.invoiceNumber,
      supplierName: document.supplierName,
      customerName: document.customerName,
    },
  });
}

/**
 * BEHAVIOUR.md Errors: malformed JSON returns HTTP 400 Express HTML, not JSON.
 */
export function malformedJson(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : 'Unexpected end of JSON input';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>SyntaxError: ${escapeHtml(message)}<br> &nbsp; &nbsp;at JSON.parse (&lt;anonymous&gt;)</pre>
</body>
</html>
`;
  return new Response(html, {
    status: 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
