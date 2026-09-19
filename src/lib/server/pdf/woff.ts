import { inflateSync } from 'node:zlib';

const WOFF_SIGNATURE = 0x774f4646;

type WoffTable = {
  tag: number;
  origChecksum: number;
  data: Uint8Array;
};

/**
 * pdf-lib FontFile2 streams must be TTF/OTF (SFNT). Fontsource ships WOFF.
 * Convert the WOFF wrapper back to the original SFNT bytes.
 */
export function woffToSfnt(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < 44 || view.getUint32(0) !== WOFF_SIGNATURE) {
    throw new Error('Not a WOFF font');
  }

  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const tables: WoffTable[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const offset = 44 + i * 20;
    const tag = view.getUint32(offset);
    const tableOffset = view.getUint32(offset + 4);
    const compLength = view.getUint32(offset + 8);
    const origLength = view.getUint32(offset + 12);
    const origChecksum = view.getUint32(offset + 16);
    const slice = woff.subarray(tableOffset, tableOffset + compLength);
    const data =
      compLength < origLength ? inflateSync(slice) : Buffer.from(slice);
    if (data.length !== origLength) {
      throw new Error(`WOFF table ${tag.toString(16)} length mismatch`);
    }
    tables.push({ tag, origChecksum, data: new Uint8Array(data) });
  }

  tables.sort((a, b) => a.tag - b.tag);

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 16 * 2 ** entrySelector;
  const rangeShift = numTables * 16 - searchRange;

  let dataOffset = 12 + 16 * numTables;
  const placed = tables.map((table) => {
    const pad = (4 - (table.data.length % 4)) % 4;
    const record = {
      ...table,
      offset: dataOffset,
      paddedLength: table.data.length + pad,
    };
    dataOffset += record.paddedLength;
    return record;
  });

  const out = new Uint8Array(dataOffset);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, flavor);
  outView.setUint16(4, numTables);
  outView.setUint16(6, searchRange);
  outView.setUint16(8, entrySelector);
  outView.setUint16(10, rangeShift);

  for (let i = 0; i < placed.length; i += 1) {
    const table = placed[i];
    const dir = 12 + i * 16;
    outView.setUint32(dir, table.tag);
    outView.setUint32(dir + 4, table.origChecksum);
    outView.setUint32(dir + 8, table.offset);
    outView.setUint32(dir + 12, table.data.length);
    out.set(table.data, table.offset);
  }

  return out;
}
