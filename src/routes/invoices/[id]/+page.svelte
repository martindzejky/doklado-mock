<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const invoice = $derived(data.invoice);
</script>

<svelte:head>
  <title>{invoice.invoiceNumber}</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-main flex-col gap-6 px-4 py-8">
  <p class="text-sm">
    <a href="/" class="text-accent underline underline-offset-4">Inspector</a>
  </p>
  <h1 class="text-2xl font-bold">{invoice.invoiceNumber}</h1>
  <dl class="grid gap-2 text-sm sm:grid-cols-2">
    <div>
      <dt class="text-muted">Customer</dt>
      <dd>{invoice.organizationName || '—'}</dd>
    </div>
    <div>
      <dt class="text-muted">Total</dt>
      <dd>{invoice.totalPrice.toFixed(2)} {invoice.currency}</dd>
    </div>
    <div>
      <dt class="text-muted">Paid</dt>
      <dd>{invoice.paymentStatus || 'unpaid'}</dd>
    </div>
    <div>
      <dt class="text-muted">Created</dt>
      <dd>{invoice.createdAt}</dd>
    </div>
    <div>
      <dt class="text-muted">Subtype</dt>
      <dd>{invoice.subType}</dd>
    </div>
    <div>
      <dt class="text-muted">Issuer email</dt>
      <dd>{invoice.email}</dd>
    </div>
  </dl>
  <iframe
    title="Invoice PDF"
    src="/invoices/{invoice.documentId}/file"
    class="h-[70vh] w-full rounded-md border border-border bg-surface"
  ></iframe>
</section>
