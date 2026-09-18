<script lang="ts">
  type RequestRow = {
    id: string;
    at: string;
    method: string;
    path: string;
    status: number;
    code: string;
    durationMs: number;
    unknownFields: string[];
  };

  let { requests }: { requests: RequestRow[] } = $props();
</script>

<section class="flex flex-col gap-3">
  <h2 class="text-lg font-semibold">Request log</h2>
  {#if requests.length === 0}
    <p class="text-sm text-muted">No requests yet.</p>
  {:else}
    <ul class="divide-y divide-border rounded-md border border-border">
      {#each requests as request (request.id)}
        <li>
          <a
            href="/requests/{request.id}"
            class="flex flex-col gap-1 px-3 py-2 hover:bg-surface"
          >
            <div class="flex flex-wrap items-baseline gap-2 text-sm">
              <span class="font-medium">{request.method}</span>
              <span class="font-mono text-xs">{request.path}</span>
              <span
                class={request.status >= 400 ? 'text-error' : 'text-success'}
              >
                {request.status}
              </span>
              {#if request.code}
                <span class="text-muted">{request.code}</span>
              {/if}
              <span class="ml-auto text-xs text-muted"
                >{request.durationMs}ms</span
              >
            </div>
            {#if request.unknownFields.length > 0}
              <p class="text-xs text-error">
                unknown fields: {request.unknownFields.join(', ')}
              </p>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
