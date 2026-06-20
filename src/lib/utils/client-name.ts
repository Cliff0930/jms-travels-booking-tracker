const SIR_RE   = /^(Mr\.?|Shri\.?|Sri\.?|Sh\.?)\s+/i
const MADAM_RE = /^(Mrs\.?|Ms\.?|Miss\.?|Smt\.?)\s+/i

/** Strips invisible Unicode and collapses spaces — safe for WhatsApp template params */
export function sanitizeWaParam(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/[​-‏­﻿  ]/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

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
  const clean = sanitizeWaParam(name)
  if (!clean || clean === 'there' || clean === 'Guest') return clean
  const base = prefix ? `${prefix} ${clean}` : clean
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
  const clean = sanitizeWaParam(name)
  if (!clean || clean === 'there' || clean === 'Guest') return clean
  if (salutation === 'sir') return `${clean} Sir`
  if (salutation === 'madam') return `${clean} Madam`
  if (companyFormalAddress) return `${clean} Sir`
  return clean
}
