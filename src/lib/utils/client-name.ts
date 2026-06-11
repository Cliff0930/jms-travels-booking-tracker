const SIR_RE   = /^(Mr\.?|Shri\.?|Sri\.?|Sh\.?)\s+/i
const MADAM_RE = /^(Mrs\.?|Ms\.?|Miss\.?|Smt\.?)\s+/i

/**
 * Strips an honorific prefix from a raw name and returns the clean name + inferred salutation.
 * e.g. "Mr. Rajesh Kumar" → { cleanName: "Rajesh Kumar", salutation: "sir" }
 *      "Mrs. Priya Sharma" → { cleanName: "Priya Sharma", salutation: "madam" }
 *      "Kiran Singh"       → { cleanName: "Kiran Singh", salutation: null }
 */
export function extractHonorific(rawName: string): { cleanName: string; salutation: 'sir' | 'madam' | null } {
  const sirMatch = rawName.match(SIR_RE)
  if (sirMatch) return { cleanName: rawName.slice(sirMatch[0].length).trim(), salutation: 'sir' }

  const madamMatch = rawName.match(MADAM_RE)
  if (madamMatch) return { cleanName: rawName.slice(madamMatch[0].length).trim(), salutation: 'madam' }

  return { cleanName: rawName.trim(), salutation: null }
}

/**
 * Builds the formal address for a guest using their prefix and designation.
 * Rule: prefix + name [+ ", " + designation only if showDesignation=true].
 * Falls back to plain name when no prefix is set.
 */
export function formalGuestName(
  name: string,
  prefix?: string | null,
  designation?: string | null,
  showDesignation?: boolean | null,
): string {
  if (!name || name === 'there' || name === 'Guest') return name
  const base = prefix ? `${prefix} ${name}` : name
  if (designation && showDesignation) return `${base}, ${designation}`
  return base
}

/**
 * Appends a formal salutation suffix (Sir/Madam) to a client name.
 * Used for government/official companies where formal address is required.
 *
 * Priority: explicit salutation > company formal_address fallback (defaults to Sir) > plain name
 * Safe: returns name unchanged if name is empty, 'there', or 'Guest'.
 */
export function formalName(
  name: string,
  salutation?: string | null,
  companyFormalAddress?: boolean | null,
): string {
  if (!name || name === 'there' || name === 'Guest') return name
  if (salutation === 'sir') return `${name} Sir`
  if (salutation === 'madam') return `${name} Madam`
  if (companyFormalAddress) return `${name} Sir`
  return name
}
