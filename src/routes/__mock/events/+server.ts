import { handleMockEvents } from '$lib/server/mock/controls';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => handleMockEvents(request);
