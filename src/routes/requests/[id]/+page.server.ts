import { store } from '$lib/server/state/store';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const entry = store.requests.find((request) => request.id === params.id);
  if (!entry) error(404, 'Request not found');
  return { entry };
};
