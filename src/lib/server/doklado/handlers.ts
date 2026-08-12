import { schemaError } from './errors';
import { withCatchAll, withDoklado } from './http';
import { issueInvoice } from './issue';
import { issueInvoiceDataSchema, treeify } from './schemas';
import { unknownIssueFields } from './unknown-fields';

export function handleInvoiceIssue(request: Request): Promise<Response> {
  return withDoklado(request, (data) => {
    const unknownFields = unknownIssueFields(data);
    const parsed = issueInvoiceDataSchema.safeParse(data);
    if (!parsed.success) {
      return { response: schemaError(treeify(parsed.error)), unknownFields };
    }
    return { response: issueInvoice(parsed.data), unknownFields };
  });
}

export function handleCatchAll(request: Request): Promise<Response> {
  return withCatchAll(request);
}
