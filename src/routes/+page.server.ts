import { store } from '$lib/server/state/store';
import { invoiceSummary, requestSummary } from '$lib/server/state/views';

export function load() {
  return {
    invoices: store.invoices.map(invoiceSummary),
    requests: store.requests.slice(0, 100).map(requestSummary),
  };
}
