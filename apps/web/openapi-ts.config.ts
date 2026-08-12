import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Regenerates src/api/ from the running backend's OpenAPI document.
 * Start the API first (`pnpm --filter @myfinance/api dev`), then run
 * `pnpm --filter @myfinance/web generate:api`.
 */
export default defineConfig({
  input: process.env.OPENAPI_URL ?? 'http://localhost:8001/api-json',
  output: {
    path: 'src/api',
    postProcess: ['prettier'],
  },
  plugins: [
    {
      name: '@hey-api/client-axios',
      // Bound to our axios instance so base URL and error handling stay in one place.
      runtimeConfigPath: './src/client/hey-api.ts',
    },
    { name: '@hey-api/typescript', enums: 'javascript' },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
  ],
});
