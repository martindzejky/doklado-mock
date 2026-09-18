import { describe, expect, test } from 'vitest';
import { loadConfig, resolveConfigPath } from './load';

describe('loadConfig', () => {
  test('loads the example config from the working directory', () => {
    const config = loadConfig();
    expect(config.apiKeys).toContain('test-api-key');
    expect(resolveConfigPath()).toMatch(/doklado-mock\.config/);
  });
});
