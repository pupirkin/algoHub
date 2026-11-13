/**
 * Client-side catalog search (ARCHITECTURE_PLAN §6: 32 items, no backend).
 *
 * Semantics: the query is split into tokens; a product matches when EVERY token occurs as a substring of its
 * normalized text (AND). Matching is case-insensitive and treats «ё» as «е». A crude suffix strip keeps
 * Russian word forms matching («смены» → «смен», «покупки» → «покуп»): tokens of 5+ letters lose their last
 * 1–2 characters. The stem is always a prefix of the token, so stemming only ever widens a match.
 */

export interface SearchDoc {
  readonly id: string;
  /** Pre-normalized text: title, tagline, purpose, core, tag/profile/status labels, id. */
  readonly text: string;
}

export function normalize(s: string): string {
  return s.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

export function stem(token: string): string {
  if (token.length >= 6) return token.slice(0, -2);
  if (token.length === 5) return token.slice(0, -1);
  return token;
}

export function tokenize(query: string): string[] {
  const q = normalize(query);
  return q === "" ? [] : q.split(" ").map(stem);
}

export function makeDoc(id: string, parts: readonly string[]): SearchDoc {
  return { id, text: normalize(parts.join(" ")) };
}

/** Returns ids of matching docs in their original order. Empty query → all docs. */
export function search(docs: readonly SearchDoc[], query: string): string[] {
  const tokens = tokenize(query);
  return docs.filter((d) => tokens.every((t) => d.text.includes(t))).map((d) => d.id);
}
