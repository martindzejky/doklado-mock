import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // https://svelte.dev/docs/kit/integrations
  preprocess: vitePreprocess(),

  kit: {
    // https://svelte.dev/docs/kit/adapters
    adapter: adapter(),
    // JSON API clients post from other origins. Form CSRF still does not apply
    // to application/json, but this keeps the mock usable from browsers.
    csrf: {
      trustedOrigins: ['*'],
    },
  },
};

export default config;
