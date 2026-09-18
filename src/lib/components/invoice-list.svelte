<script lang="ts">
  type InvoiceRow = {
    documentId: string;
    invoiceNumber: string;
    organizationName: string;
    totalPrice: number;
    currency: string;
    paymentStatus: string;
    createdAt: string;
  };

  let { invoices }: { invoices: InvoiceRow[] } = $props();
</script>

<section class="flex flex-col gap-3">
  <h2 class="text-lg font-semibold">Invoices</h2>
  {#if invoices.length === 0}
    <p class="text-sm text-muted">No invoices yet.</p>
  {:else}
    <ul class="divide-y divide-border rounded-md border border-border">
      {#each invoices as invoice (invoice.documentId)}
        <li>
          <a
            href="/invoices/{invoice.documentId}"
            class="flex flex-col gap-1 px-3 py-2 hover:bg-surface"
          >
            <div class="flex flex-wrap items-baseline gap-2 text-sm">
              <span class="font-medium">{invoice.invoiceNumber}</span>
              <span>{invoice.organizationName || '—'}</span>
              <span class="ml-auto">
                {invoice.totalPrice.toFixed(2)}
                {invoice.currency}
              </span>
            </div>
            <div class="flex gap-2 text-xs text-muted">
              <span>{invoice.paymentStatus || 'not_paid'}</span>
              <span>{invoice.createdAt}</span>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
