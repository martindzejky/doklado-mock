import { handleMockSeed } from '$lib/server/mock/controls';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => handleMockSeed(request);
