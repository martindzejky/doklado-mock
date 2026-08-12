<script lang="ts">
  import InvoiceList from '$lib/components/invoice-list.svelte';
  import RequestLog from '$lib/components/request-log.svelte';
  import Toolbar from '$lib/components/toolbar.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>doklado-mock</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-main flex-col gap-6 px-4 py-8">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold">Inspector</h1>
      <p class="text-sm text-muted">
        Request log and issued invoices. State lives in memory.
      </p>
    </div>
    <Toolbar />
  </div>

  <div class="grid gap-8 lg:grid-cols-2">
    <RequestLog requests={data.requests} />
    <InvoiceList invoices={data.invoices} />
  </div>
</section>
