import { handleCatchAll } from '$lib/server/doklado/handlers';
import type { RequestHandler } from './$types';

export const fallback: RequestHandler = ({ request }) =>
  handleCatchAll(request);
