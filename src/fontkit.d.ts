declare module 'fontkit' {
  export interface Font {
    hasGlyphForCodePoint(codePoint: number): boolean;
  }

  export function create(buffer: Buffer | Uint8Array): Font;

  const fontkit: {
    create: typeof create;
  };

  export default fontkit;
}
