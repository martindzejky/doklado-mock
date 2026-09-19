<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  let busy = $state(false);
  let errorMessage = $state('');

  function messageFrom(status: number, body: unknown): string {
    if (body && typeof body === 'object') {
      const record = body as {
        code?: unknown;
        error?: unknown;
        message?: unknown;
      };
      if (typeof record.code === 'string' && record.code) return record.code;
      if (typeof record.error === 'string' && record.error) return record.error;
      if (typeof record.message === 'string' && record.message) {
        return record.message;
      }
    }
    return `HTTP ${status}`;
  }

  async function run(path: string): Promise<void> {
    busy = true;
    errorMessage = '';
    try {
      const response = await fetch(path, { method: 'POST' });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const failed =
        !response.ok ||
        (body !== null &&
          typeof body === 'object' &&
          'success' in body &&
          (body as { success: unknown }).success === false);
      if (failed) errorMessage = messageFrom(response.status, body);
      await invalidateAll();
    } catch (caught) {
      errorMessage =
        caught instanceof Error ? caught.message : 'Request failed';
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col items-end gap-2">
  <div class="flex flex-wrap gap-2">
    <button
      type="button"
      class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface"
      disabled={busy}
      onclick={() => run('/__mock/reset')}
    >
      Reset
    </button>
    <button
      type="button"
      class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-accent-dark"
      disabled={busy}
      onclick={() => run('/__mock/seed')}
    >
      Seed invoice
    </button>
  </div>
  {#if errorMessage}
    <p class="text-sm text-error" role="alert">{errorMessage}</p>
  {/if}
</div>
