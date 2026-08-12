import { handleGetInvoicePdf } from '$lib/server/doklado/handlers';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
  handleGetInvoicePdf(request);
