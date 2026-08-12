import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockConfigSchema, type MockConfig } from './schema';

const PACKAGE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

export const EXAMPLE_CONFIG_PATH = join(
  PACKAGE_ROOT,
  'doklado-mock.config.example.json',
);

export function resolveConfigPath(explicit?: string): string {
  if (explicit) {
    return isAbsolute(explicit) ? explicit : join(process.cwd(), explicit);
  }
  if (process.env.DOKLADO_MOCK_CONFIG) {
    const fromEnv = process.env.DOKLADO_MOCK_CONFIG;
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return EXAMPLE_CONFIG_PATH;
}

export function loadConfig(explicit?: string): MockConfig {
  const path = resolveConfigPath(explicit);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return mockConfigSchema.parse(raw);
}
