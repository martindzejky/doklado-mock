import { store } from '$lib/server/state/store';
import { invoiceDetail } from '$lib/server/state/views';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  const invoice = store.findInvoice(params.id);
  if (!invoice) error(404, 'Invoice not found');
  return { invoice: invoiceDetail(invoice) };
};
