<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  let busy = $state(false);

  async function reset(): Promise<void> {
    busy = true;
    try {
      await fetch('/__mock/reset', { method: 'POST' });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function seed(): Promise<void> {
    busy = true;
    try {
      await fetch('/__mock/seed', { method: 'POST' });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-wrap gap-2">
  <button
    type="button"
    class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface"
    disabled={busy}
    onclick={reset}
  >
    Reset
  </button>
  <button
    type="button"
    class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-dark"
    disabled={busy}
    onclick={seed}
  >
    Seed invoice
  </button>
</div>
