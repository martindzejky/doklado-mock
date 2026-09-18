import { existsSync, readFileSync } from 'node:fs';
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

function absolute(path: string): string {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

export function resolveConfigPath(explicit?: string): string {
  if (explicit) return absolute(explicit);
  if (process.env.DOKLADO_MOCK_CONFIG) {
    return absolute(process.env.DOKLADO_MOCK_CONFIG);
  }
  const cwdConfig = join(process.cwd(), 'doklado-mock.config.json');
  if (existsSync(cwdConfig)) return cwdConfig;
  const cwdExample = join(process.cwd(), 'doklado-mock.config.example.json');
  if (existsSync(cwdExample)) return cwdExample;
  return EXAMPLE_CONFIG_PATH;
}

export function loadConfig(explicit?: string): MockConfig {
  const path = resolveConfigPath(explicit);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return mockConfigSchema.parse(raw);
}
