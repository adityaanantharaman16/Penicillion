import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Read the Unicode character maps from the actual shipped TrueType binaries.
// This catches a new label or medical term silently introducing a system font.
function supportedCharacters(font) {
  const u16 = (offset) => font.readUInt16BE(offset),
    u32 = (offset) => font.readUInt32BE(offset);
  let cmap;
  for (let i = 0; i < u16(4); i++) {
    const table = 12 + i * 16;
    if (font.toString('ascii', table, table + 4) === 'cmap') cmap = u32(table + 8);
  }
  assert.ok(cmap, 'TrueType file must contain a character map');
  const supports = [];
  for (let i = 0; i < u16(cmap + 2); i++) {
    const record = cmap + 4 + i * 8,
      platform = u16(record),
      encoding = u16(record + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue;
    const map = cmap + u32(record + 4),
      format = u16(map);
    if (format === 4) {
      const count = u16(map + 6) / 2,
        end = map + 14,
        start = end + 2 * count + 2,
        delta = start + 2 * count,
        range = delta + 2 * count;
      supports.push((code) => {
        for (let n = 0; n < 2 * count; n += 2) {
          if (code > u16(end + n)) continue;
          const first = u16(start + n);
          if (code < first) return false;
          const offset = u16(range + n),
            adjustment = u16(delta + n);
          if (!offset) return ((code + adjustment) & 0xffff) !== 0;
          const glyph = u16(range + n + offset + 2 * (code - first));
          return glyph !== 0 && ((glyph + adjustment) & 0xffff) !== 0;
        }
        return false;
      });
    } else if (format === 12) {
      supports.push((code) => {
        for (let n = 0; n < u32(map + 12); n++) {
          const group = map + 16 + n * 12,
            first = u32(group);
          if (code < first) return false;
          if (code <= u32(group + 4)) return u32(group + 8) + code - first !== 0;
        }
        return false;
      });
    }
  }
  assert.ok(supports.length, 'Expected a Unicode font map');
  return (code) => supports.some((inMap) => inMap(code));
}
test('local pixel fonts cover all authored game text, the frozen medical catalog and every share mark', async () => {
  const web = new URL('../web/', import.meta.url);
  const fonts = await Promise.all(
    ['pixelify-sans.ttf', 'penicillion-symbols.ttf'].map(async (file) =>
      supportedCharacters(await readFile(new URL('fonts/' + file, web))),
    ),
  );
  const files = (await readdir(web))
    .filter((name) => /\.(html|js)$/.test(name))
    .map((name) => new URL(name, web));
  files.push(new URL('../content/release.json', web), new URL('../local-idp/server.mjs', web));
  const required = new Set();
  for (const file of files)
    for (const char of await readFile(file, 'utf8')) if (!/\s/u.test(char)) required.add(char);
  const missing = [...required].filter((char) => !fonts.some((cmap) => cmap(char.codePointAt(0))));
  assert.deepEqual(missing, []);
});
