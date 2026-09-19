import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  EXAMPLE_CONFIG_PATH,
  PACKAGE_ROOT,
  loadConfig,
  resolveConfigPath,
} from './load';

const customConfig = `{
  "apiKeys": ["pack-smoke-key"],
  "organisations": [
    {
      "id": "11111111",
      "name": "Caller s.r.o.",
      "country": "SK",
      "homeCurrency": "EUR",
      "email": "invoices@caller.sk",
      "bank": {
        "iban": "SK3112000000198742637541",
        "bic": "GIBASKBX"
      },
      "series": [
        {
          "name": "Issued invoices",
          "mask": "#RRRRCCC",
          "exportAbbreviation": "FA",
          "counter": 1,
          "default": true
        }
      ]
    }
  ],
  "exchangeRates": { "EUR": 1 }
}
`;

const previousCwd = process.cwd();
const previousConfigEnv = process.env.DOKLADO_MOCK_CONFIG;
const tempDirs: string[] = [];

afterEach(() => {
  process.chdir(previousCwd);
  if (previousConfigEnv === undefined) {
    delete process.env.DOKLADO_MOCK_CONFIG;
  } else {
    process.env.DOKLADO_MOCK_CONFIG = previousConfigEnv;
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'doklado-mock-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('loadConfig', () => {
  test('loads the example config from the working directory', () => {
    delete process.env.DOKLADO_MOCK_CONFIG;
    const config = loadConfig();
    expect(config.apiKeys).toContain('test-api-key');
    expect(resolveConfigPath()).toMatch(/doklado-mock\.config/);
  });

  test('finds the packaged example from the package root', () => {
    expect(PACKAGE_ROOT).toBe(previousCwd);
    expect(EXAMPLE_CONFIG_PATH).toBe(
      join(previousCwd, 'doklado-mock.config.example.json'),
    );
    const empty = tempDir();
    delete process.env.DOKLADO_MOCK_CONFIG;
    process.chdir(empty);
    expect(resolveConfigPath()).toBe(EXAMPLE_CONFIG_PATH);
    expect(loadConfig().apiKeys).toContain('test-api-key');
  });

  test('resolves an explicit relative config from the caller cwd', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'custom.json'), customConfig);
    delete process.env.DOKLADO_MOCK_CONFIG;
    process.chdir(dir);
    expect(resolveConfigPath('./custom.json')).toBe(join(dir, 'custom.json'));
    expect(loadConfig('./custom.json').apiKeys).toEqual(['pack-smoke-key']);
  });

  test('resolves DOKLADO_MOCK_CONFIG relative to the caller cwd', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'from-env.json'), customConfig);
    process.chdir(dir);
    process.env.DOKLADO_MOCK_CONFIG = './from-env.json';
    expect(resolveConfigPath()).toBe(join(dir, 'from-env.json'));
    expect(loadConfig().organisations[0].id).toBe('11111111');
  });
});
