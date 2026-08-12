// https://prettier.io/docs/en/configuration
export default {
  tabWidth: 2,
  printWidth: 80,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,

  plugins: [
    'prettier-plugin-svelte',
    'prettier-plugin-tailwindcss',
    'prettier-plugin-organize-imports',
  ],

  tailwindFunctions: ['clsx'],
  tailwindStylesheet: './src/app.css',

  overrides: [
    {
      files: '*.svelte',
      options: {
        parser: 'svelte',
      },
    },
  ],
};
