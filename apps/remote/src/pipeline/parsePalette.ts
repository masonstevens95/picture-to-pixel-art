import type { RGB } from "./palettes";

/**
 * Forgiving hex-color parser for user-pasted palette input.
 *
 * Two distinct overflow paths (resolved during planning per doc review):
 *   - Index ≥ 64: silent truncation (no error).
 *   - Malformed token (non-hex / wrong length): inline error returned
 *     with the bad token highlighted; the parse aborts at the bad token
 *     so partial application doesn't silently happen.
 *
 * Accepts:
 *   - Whitespace and/or comma separators.
 *   - Optional leading #.
 *   - 3-digit shorthand (#rgb → expanded to #rrggbb) or 6-digit hex.
 *   - Mixed case.
 */

export const PALETTE_MAX_COLORS = 64;

export type ParsePaletteResult =
  | { ok: true; colors: RGB[]; truncated: boolean }
  | { ok: false; error: string; badToken: string };

export function parsePalette(input: string): ParsePaletteResult {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { ok: false, error: "Enter at least one hex color.", badToken: "" };
  }

  const colors: RGB[] = [];
  let truncated = false;

  for (const raw of tokens) {
    if (colors.length >= PALETTE_MAX_COLORS) {
      truncated = true;
      break;
    }
    const parsed = parseHexToken(raw);
    if (!parsed) {
      return {
        ok: false,
        error: `Invalid color: "${raw}". Use #rgb or #rrggbb format.`,
        badToken: raw,
      };
    }
    colors.push(parsed);
  }

  return { ok: true, colors, truncated };
}

function parseHexToken(token: string): RGB | null {
  const stripped = token.startsWith("#") ? token.slice(1) : token;
  if (!/^[0-9a-fA-F]+$/.test(stripped)) return null;

  if (stripped.length === 3) {
    const r = parseInt(stripped[0]! + stripped[0]!, 16);
    const g = parseInt(stripped[1]! + stripped[1]!, 16);
    const b = parseInt(stripped[2]! + stripped[2]!, 16);
    return [r, g, b];
  }
  if (stripped.length === 6) {
    const r = parseInt(stripped.slice(0, 2), 16);
    const g = parseInt(stripped.slice(2, 4), 16);
    const b = parseInt(stripped.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}
