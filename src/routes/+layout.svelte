<script lang="ts">
  import '../app.css';

  const { children } = $props();
</script>

<div class="grid min-h-dvh grid-cols-1 grid-rows-[auto_1fr]">
  <header class="border-b border-border bg-surface">
    <div class="mx-auto flex max-w-main items-center px-4 py-3">
      <a href="/" class="font-medium">doklado-mock</a>
    </div>
  </header>

  <main class="flex flex-col">
    {@render children()}
  </main>
</div>
