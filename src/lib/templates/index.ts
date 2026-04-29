export function fillTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export const TEMPLATE_KEYS = {
  BOOKING_RECEIVED: 'booking_received',
  MISSING_INFO_REQUEST: 'missing_info_request',
  APPROVAL_REQUEST: 'approval_request',
  APPROVAL_CHASE: 'approval_chase',
  VERBAL_APPROVAL_ACK: 'verbal_approval_ack',
  BOOKING_CONFIRMED: 'booking_confirmed',
  DRIVER_DETAILS_TO_CLIENT: 'driver_details_to_client',
  TRIP_BRIEF_TO_DRIVER: 'trip_brief_to_driver',
  CANCELLATION_CLIENT: 'cancellation_client',
  CANCELLATION_DRIVER: 'cancellation_driver',
  SUBSTITUTE_VEHICLE_CLIENT: 'substitute_vehicle_client',
} as const
