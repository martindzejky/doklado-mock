<script lang="ts">
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const entry = $derived(data.entry);
</script>

<svelte:head>
  <title>{entry.method} {entry.path}</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-main flex-col gap-6 px-4 py-8">
  <p class="text-sm">
    <a href="/" class="text-accent underline underline-offset-4">Inspector</a>
  </p>
  <h1 class="text-2xl font-bold">{entry.method} {entry.path}</h1>
  <p class="text-sm text-muted">
    {entry.status}
    {entry.code}
    · {entry.durationMs}ms · {entry.at}
  </p>
  {#if entry.unknownFields.length > 0}
    <p class="text-sm text-error">
      Unknown fields: {entry.unknownFields.join(', ')}
    </p>
  {/if}
  <section class="flex flex-col gap-2">
    <h2 class="font-semibold">Request</h2>
    <pre
      class="overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs">{JSON.stringify(
        entry.requestBody,
        null,
        2,
      )}</pre>
  </section>
  <section class="flex flex-col gap-2">
    <h2 class="font-semibold">Response</h2>
    <pre
      class="overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs">{JSON.stringify(
        entry.responseBody,
        null,
        2,
      )}</pre>
  </section>
</section>
