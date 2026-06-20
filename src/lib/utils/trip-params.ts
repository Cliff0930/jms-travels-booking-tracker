import { sanitizeWaParam } from './client-name'

export interface PickupStop {
  order: number
  location: string
  time: string | null
  guest: string | null
}

/**
 * Builds the pickup template param for WhatsApp — safe for Meta (no newlines).
 * Single pickup: "MG Road | Map: https://..."
 * Multi-stop:    "Stop 1: MG Road 09:00 Rajesh | Stop 2: Koramangala 09:20 Priya"
 */
export function buildPickupParam(
  pickupLocation: string | null,
  pickupLocationUrl: string | null,
  pickupStops: unknown,
): string {
  const stops = Array.isArray(pickupStops) ? (pickupStops as PickupStop[]) : null
  if (stops && stops.length > 1) {
    return stops
      .map(s => {
        const parts: string[] = [`Stop ${s.order}: ${sanitizeWaParam(s.location)}`]
        if (s.time) parts.push(s.time)
        if (s.guest) parts.push(sanitizeWaParam(s.guest))
        return parts.join(' ')
      })
      .join(' | ')
  }
  return [
    sanitizeWaParam(pickupLocation || 'TBD'),
    pickupLocationUrl ? `Map: ${sanitizeWaParam(pickupLocationUrl)}` : null,
  ].filter(Boolean).join(' | ')
}

/**
 * Builds pickup text for the free-form fallback body (newlines allowed here).
 * Single pickup: "MG Road | Map: https://..."
 * Multi-stop:    "Stop 1: MG Road (09:00, Rajesh)\nStop 2: Koramangala (09:20, Priya)"
 */
export function buildPickupLines(
  pickupLocation: string | null,
  pickupLocationUrl: string | null,
  pickupStops: unknown,
): string {
  const stops = Array.isArray(pickupStops) ? (pickupStops as PickupStop[]) : null
  if (stops && stops.length > 1) {
    return stops
      .map(s => {
        const meta = [s.time, s.guest].filter(Boolean).join(', ')
        return `Stop ${s.order}: ${s.location}${meta ? ` (${meta})` : ''}`
      })
      .join('\n')
  }
  return [
    pickupLocation || 'TBD',
    pickupLocationUrl ? `Map: ${pickupLocationUrl}` : null,
  ].filter(Boolean).join(' | ')
}
