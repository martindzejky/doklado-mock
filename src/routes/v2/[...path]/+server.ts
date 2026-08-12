import { handleCatchAll } from '$lib/server/doklado/handlers';
import type { RequestHandler } from './$types';

const handle: RequestHandler = ({ request }) => handleCatchAll(request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
