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
