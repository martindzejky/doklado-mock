#!/usr/bin/env node
/**
 * Re-fetch Doklado's public OpenAPI document and fail when it differs from
 * spec/swagger.json. Behaviour is recorded in BEHAVIOUR.md; this only detects
 * that their published spec moved.
 *
 * Comparison is byte-for-byte on purpose. New endpoints the mock does not
 * implement still fail the job so someone reviews them. A semantic summary is
 * printed on mismatch; it never decides the result.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_URL = 'https://api-doc.doklado.sk/swagger.json';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_PATH = join(ROOT, 'spec/swagger.json');

const MOCK_PATHS = [
  '/v1/documents/invoice-issue',
  '/v1/documents/get-invoice-pdf',
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return n;
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

function collectRefs(value: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, acc);
    return acc;
  }
  if (value === null || typeof value !== 'object') return acc;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string') acc.add(record.$ref);
  for (const nested of Object.values(record)) collectRefs(nested, acc);
  return acc;
}

function schemaName(ref: string): string | undefined {
  const prefix = '#/components/schemas/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined;
}

function schemaClosure(
  spec: Record<string, unknown>,
  paths: readonly string[],
): string[] {
  const specPaths = spec.paths as Record<string, unknown> | undefined;
  const components = spec.components as
    { schemas?: Record<string, unknown> } | undefined;
  const schemas = components?.schemas ?? {};
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const path of paths) {
    for (const ref of collectRefs(specPaths?.[path])) {
      const name = schemaName(ref);
      if (name) queue.push(name);
    }
  }
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    for (const ref of collectRefs(schemas[name])) {
      const nested = schemaName(ref);
      if (nested && !seen.has(nested)) queue.push(nested);
    }
  }
  return [...seen].sort();
}

function listDiff(local: string[], remote: string[]): string[] {
  const lines: string[] = [];
  const onlyRemote = remote.filter((item) => !local.includes(item));
  const onlyLocal = local.filter((item) => !remote.includes(item));
  if (onlyRemote.length > 0) lines.push(`    added: ${onlyRemote.join(', ')}`);
  if (onlyLocal.length > 0) lines.push(`    removed: ${onlyLocal.join(', ')}`);
  return lines;
}

function summarizeDrift(
  localBytes: Uint8Array,
  remoteBytes: Uint8Array,
): string[] {
  const lines: string[] = [];
  let localSpec: Record<string, unknown>;
  let remoteSpec: Record<string, unknown>;
  try {
    localSpec = JSON.parse(new TextDecoder().decode(localBytes)) as Record<
      string,
      unknown
    >;
    remoteSpec = JSON.parse(new TextDecoder().decode(remoteBytes)) as Record<
      string,
      unknown
    >;
  } catch {
    lines.push('  Could not parse one or both files as JSON.');
    return lines;
  }

  const localPaths = Object.keys(
    (localSpec.paths as Record<string, unknown> | undefined) ?? {},
  ).sort();
  const remotePaths = Object.keys(
    (remoteSpec.paths as Record<string, unknown> | undefined) ?? {},
  ).sort();
  const pathLines = listDiff(localPaths, remotePaths);
  const changedPaths = localPaths.filter((path) => {
    if (!remotePaths.includes(path)) return false;
    const localPath = (localSpec.paths as Record<string, unknown>)[path];
    const remotePath = (remoteSpec.paths as Record<string, unknown>)[path];
    return canonical(localPath) !== canonical(remotePath);
  });
  if (pathLines.length > 0 || changedPaths.length > 0) {
    lines.push('  paths:');
    lines.push(...pathLines);
    if (changedPaths.length > 0) {
      lines.push(`    changed: ${changedPaths.join(', ')}`);
    }
  }

  const localSchemas = Object.keys(
    (localSpec.components as { schemas?: Record<string, unknown> } | undefined)
      ?.schemas ?? {},
  ).sort();
  const remoteSchemas = Object.keys(
    (remoteSpec.components as { schemas?: Record<string, unknown> } | undefined)
      ?.schemas ?? {},
  ).sort();
  const schemaLines = listDiff(localSchemas, remoteSchemas);
  const changedSchemas = localSchemas.filter((name) => {
    if (!remoteSchemas.includes(name)) return false;
    const localSchema = (
      localSpec.components as { schemas: Record<string, unknown> }
    ).schemas[name];
    const remoteSchema = (
      remoteSpec.components as { schemas: Record<string, unknown> }
    ).schemas[name];
    return canonical(localSchema) !== canonical(remoteSchema);
  });
  if (schemaLines.length > 0 || changedSchemas.length > 0) {
    lines.push('  schemas:');
    lines.push(...schemaLines);
    if (changedSchemas.length > 0) {
      lines.push(`    changed: ${changedSchemas.join(', ')}`);
    }
  }

  const localFocus = schemaClosure(localSpec, MOCK_PATHS);
  const remoteFocus = schemaClosure(remoteSpec, MOCK_PATHS);
  const mockPathChanged = MOCK_PATHS.filter((path) => {
    const localPath = (
      localSpec.paths as Record<string, unknown> | undefined
    )?.[path];
    const remotePath = (
      remoteSpec.paths as Record<string, unknown> | undefined
    )?.[path];
    return canonical(localPath) !== canonical(remotePath);
  });
  const mockSchemaChanged = [
    ...new Set([...localFocus, ...remoteFocus]),
  ].filter((name) => {
    const localSchema = (
      localSpec.components as { schemas?: Record<string, unknown> } | undefined
    )?.schemas?.[name];
    const remoteSchema = (
      remoteSpec.components as { schemas?: Record<string, unknown> } | undefined
    )?.schemas?.[name];
    return canonical(localSchema) !== canonical(remoteSchema);
  });
  if (mockPathChanged.length === 0 && mockSchemaChanged.length === 0) {
    lines.push(
      `  mock endpoints ${MOCK_PATHS.join(', ')} and their referenced schemas: unchanged`,
    );
  } else {
    lines.push('  mock endpoints CHANGED:');
    if (mockPathChanged.length > 0) {
      lines.push(`    paths: ${mockPathChanged.join(', ')}`);
    }
    if (mockSchemaChanged.length > 0) {
      lines.push(`    schemas: ${mockSchemaChanged.join(', ')}`);
    }
  }

  if (lines.length === 0) {
    lines.push(
      '  JSON parses to the same paths and schemas; the byte difference is formatting or other top-level fields.',
    );
  }
  return lines;
}

const local = await readFile(LOCAL_PATH);

const response = await fetch(SPEC_URL);
if (!response.ok) {
  console.error(
    `Failed to fetch ${SPEC_URL}: HTTP ${response.status} ${response.statusText}`,
  );
  process.exit(1);
}

const remote = new Uint8Array(await response.arrayBuffer());

if (local.length === remote.length && local.equals(remote)) {
  console.log(
    `swagger.json unchanged (${local.length} bytes, ${sha256(local)})`,
  );
  process.exit(0);
}

const offset = firstDiff(local, remote);
console.error(`swagger.json drifted from ${SPEC_URL}`);
console.error(`  local:  ${local.length} bytes, ${sha256(local)}`);
console.error(`  remote: ${remote.length} bytes, ${sha256(remote)}`);
console.error(`  first difference at byte ${offset}`);
for (const line of summarizeDrift(local, remote)) {
  console.error(line);
}
console.error(
  'Update spec/swagger.json and BEHAVIOUR.md if the published spec changed.',
);
process.exit(1);
