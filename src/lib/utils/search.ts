/**
 * Token-based search: trims, splits by whitespace, every token must appear
 * in at least one of the provided fields. Handles extra spaces and partial matches.
 */
export function tokenMatch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  return tokens.every(token => haystack.includes(token))
}

/** Normalize a query: trim and collapse multiple spaces into one. */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ')
}
