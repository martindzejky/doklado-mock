<script lang="ts">
  import { page } from '$app/state';
</script>

<section
  class="mx-auto flex max-w-medium flex-col items-center gap-4 px-4 py-16 text-center"
>
  <h1 class="text-3xl font-bold">{page.status}</h1>

  <p class="text-lg text-muted">
    {#if page.status === 404}
      This page could not be found.
    {:else}
      Something went wrong.
    {/if}
  </p>

  <a href="/" class="rounded-sm text-accent underline underline-offset-4">
    Back home
  </a>

  {#if page.status !== 404 && page.error?.message}
    <pre class="text-xs text-muted opacity-70">{page.error.message}</pre>
  {/if}
</section>
