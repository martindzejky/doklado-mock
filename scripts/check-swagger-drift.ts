#!/usr/bin/env node
/**
 * Re-fetch Doklado's public OpenAPI document and fail when it differs from
 * spec/swagger.json. Behaviour is recorded in BEHAVIOUR.md; this only detects
 * that their published spec moved.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_URL = 'https://api-doc.doklado.sk/swagger.json';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_PATH = join(ROOT, 'spec/swagger.json');

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
console.error(
  'Update spec/swagger.json and BEHAVIOUR.md if the published spec changed.',
);
process.exit(1);
