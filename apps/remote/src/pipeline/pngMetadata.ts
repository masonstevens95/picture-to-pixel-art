/**
 * Minimal PNG tEXt-chunk read/write so we can stash a JSON settings
 * blob inside an exported pixel-art PNG and recover it later. The
 * canvas API doesn't expose chunk-level control, so we surgically
 * insert a tEXt chunk before the IEND chunk of the PNG produced by
 * `convertToBlob`. Reading is the same operation in reverse.
 *
 * tEXt chunk format (PNG spec, ISO/IEC 15948):
 *   length (uint32 BE) | type "tEXt" | keyword \0 text | crc32(type+data)
 *
 * Keyword: 1-79 Latin-1 bytes, no null. Text: Latin-1, may be empty,
 * no null. We restrict text to printable ASCII via JSON, which
 * keeps Latin-1 valid and the round-trip lossless.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Walk PNG chunks. Yields each chunk's start offset and decoded type.
 * Stops after IEND or if the stream is truncated.
 */
function* walkChunks(bytes: Uint8Array): Generator<{ offset: number; length: number; type: string }> {
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length = readUint32BE(bytes, pos);
    const type = String.fromCharCode(
      bytes[pos + 4]!,
      bytes[pos + 5]!,
      bytes[pos + 6]!,
      bytes[pos + 7]!,
    );
    yield { offset: pos, length, type };
    if (type === "IEND") return;
    pos += 12 + length;
  }
}

/**
 * Insert a tEXt chunk into the PNG byte stream just before IEND.
 * Returns a new byte array; the input is not mutated. The keyword
 * MUST be 1-79 Latin-1 chars, no null bytes; text is Latin-1, no
 * null bytes. Both constraints are enforced — JSON output is safe.
 */
export function embedTextChunk(
  pngBytes: Uint8Array,
  keyword: string,
  text: string,
): Uint8Array {
  if (!isPng(pngBytes)) throw new Error("Not a PNG byte stream");
  if (keyword.length < 1 || keyword.length > 79) {
    throw new Error(`tEXt keyword must be 1-79 chars, got ${keyword.length}`);
  }
  if (keyword.includes("\0") || text.includes("\0")) {
    throw new Error("tEXt keyword/text must not contain null bytes");
  }

  let iendOffset = -1;
  for (const c of walkChunks(pngBytes)) {
    if (c.type === "IEND") {
      iendOffset = c.offset;
      break;
    }
  }
  if (iendOffset < 0) throw new Error("PNG missing IEND chunk");

  const enc = new TextEncoder();
  const keywordBytes = enc.encode(keyword);
  const textBytes = enc.encode(text);
  const dataLen = keywordBytes.length + 1 + textBytes.length;
  const chunk = new Uint8Array(12 + dataLen);
  writeUint32BE(chunk, 0, dataLen);
  // type "tEXt"
  chunk[4] = 0x74;
  chunk[5] = 0x45;
  chunk[6] = 0x58;
  chunk[7] = 0x74;
  chunk.set(keywordBytes, 8);
  chunk[8 + keywordBytes.length] = 0;
  chunk.set(textBytes, 9 + keywordBytes.length);
  // CRC over type + data
  const crc = crc32(chunk.subarray(4, 8 + dataLen));
  writeUint32BE(chunk, 8 + dataLen, crc);

  const out = new Uint8Array(pngBytes.length + chunk.length);
  out.set(pngBytes.subarray(0, iendOffset), 0);
  out.set(chunk, iendOffset);
  out.set(pngBytes.subarray(iendOffset), iendOffset + chunk.length);
  return out;
}

/**
 * Find a tEXt chunk with the given keyword and return its text,
 * or null if no chunk matches. Latin-1 decoded.
 */
export function extractTextChunk(pngBytes: Uint8Array, keyword: string): string | null {
  if (!isPng(pngBytes)) return null;
  const dec = new TextDecoder("latin1");
  for (const c of walkChunks(pngBytes)) {
    if (c.type !== "tEXt") continue;
    const data = pngBytes.subarray(c.offset + 8, c.offset + 8 + c.length);
    let nullIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        nullIdx = i;
        break;
      }
    }
    if (nullIdx <= 0) continue;
    const k = dec.decode(data.subarray(0, nullIdx));
    if (k === keyword) {
      return dec.decode(data.subarray(nullIdx + 1));
    }
  }
  return null;
}
