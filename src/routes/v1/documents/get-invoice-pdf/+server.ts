import {
  handleCatchAll,
  handleGetInvoicePdf,
} from '$lib/server/doklado/handlers';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) =>
  handleGetInvoicePdf(request);

const unsupported: RequestHandler = ({ request }) => handleCatchAll(request);

export const GET = unsupported;
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
