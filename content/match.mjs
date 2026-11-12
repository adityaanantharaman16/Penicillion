// Preserve significant numbers, qualifiers, sites, Greek letters and word boundaries.
// The editor explicitly supplies synonyms, inflections, transliterations and abbreviations.
export function normalizeAnswer(value) {
  if (typeof value !== 'string' || value.length > 96) return '';
  return value.normalize('NFKC').toLowerCase().trim()
    .replace(/[‘’]/gu, "'").replace(/[‐‑‒–—]/gu, '-').replace(/\s+/gu, ' ');
}
