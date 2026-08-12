import { handleMockReset } from '$lib/server/mock/controls';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => handleMockReset();
