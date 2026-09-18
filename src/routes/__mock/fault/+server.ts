import { handleMockFault } from '$lib/server/mock/controls';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleMockFault(request);
