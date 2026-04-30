export type BookingStatus = 'draft' | 'pending_approval' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type TripType = 'local' | 'outstation' | 'airport'
export type ServiceType = 'one_way' | 'return'
export type DriverStatus = 'available' | 'on_duty' | 'off_duty'
export type MessageChannel = 'whatsapp' | 'email'
export type MessageDirection = 'inbound' | 'outbound'
export type ClientType = 'corporate' | 'walkin'
export type BookingSource = 'whatsapp' | 'email' | 'manual' | 'bulk'
export type ApprovalChannel = 'email' | 'whatsapp' | 'both'
export type VehicleType = 'Sedan' | 'SUV' | 'MUV' | 'Van' | 'Tempo' | 'Bus' | 'Luxury'

export interface Company {
  id: string
  name: string
  aliases: string[]
  email_domains: string[]
  approver_emails: string[]
  approver_whatsapp: string[]
  approval_required: boolean
  approval_channel: ApprovalChannel
  approval_timeout_hours: number
  digest_mode: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  company_id: string | null
  name: string
  primary_phone: string | null
  primary_email: string | null
  client_type: ClientType
  designation: string | null
  default_pax: number | null
  default_vehicle_type: string | null
  is_verified: boolean
  is_vip: boolean
  company_detection_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  company?: Company
}

export interface ClientContact {
  id: string
  client_id: string
  value: string
  contact_type: 'phone' | 'email'
  role: 'additional' | 'approver' | 'cc'
  created_at: string
}

export interface ClientLocation {
  id: string
  client_id: string
  keyword: string
  address: string
  created_at: string
}

export interface Driver {
  id: string
  name: string
  phone: string
  email: string | null
  vehicle_type: VehicleType
  vehicle_name: string
  vehicle_number: string
  vehicle_color: string | null
  seating_capacity: number
  status: DriverStatus
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  booking_ref: string
  client_id: string | null
  company_id: string | null
  driver_id: string | null
  guest_name: string | null
  guest_phone: string | null
  status: BookingStatus
  trip_type: TripType
  service_type: ServiceType
  pickup_location: string | null
  drop_location: string | null
  pickup_date: string | null
  pickup_time: string | null
  pax_count: number | null
  vehicle_type: string | null
  total_days: number
  source: BookingSource
  special_instructions: string | null
  missing_fields: string[]
  flags: string[]
  approval_status: string | null
  approval_method: string | null
  approved_by: string | null
  approved_at: string | null
  approval_note: string | null
  cancelled_reason: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  client?: Client
  company?: Company
  driver?: Driver
}

export interface BookingLeg {
  id: string
  booking_id: string
  driver_id: string | null
  day_number: number
  leg_date: string
  leg_status: 'upcoming' | 'in_progress' | 'completed'
  created_at: string
  driver?: Driver
}

export interface VehicleSwap {
  id: string
  booking_id: string
  original_driver_id: string
  new_driver_id: string
  reason: string | null
  swapped_at: string
  swapped_by: string | null
}

export interface ApprovalLog {
  id: string
  booking_id: string
  approver_name: string | null
  approver_contact: string | null
  method: string | null
  note: string | null
  actioned_by: string | null
  created_at: string
}

export interface BookingStatusHistory {
  id: string
  booking_id: string
  old_status: string | null
  new_status: string
  changed_by: string
  note: string | null
  changed_at: string
}

export interface MessageLog {
  id: string
  booking_id: string | null
  client_id: string | null
  driver_id: string | null
  channel: MessageChannel
  direction: MessageDirection
  sender: string | null
  recipient: string | null
  content: string
  template_used: string | null
  status: string
  sent_at: string
}

export interface RawMessage {
  id: string
  channel: MessageChannel
  sender_phone: string | null
  sender_email: string | null
  sender_name: string | null
  cc_emails: string[]
  reply_to_emails: string[]
  raw_content: string
  ai_classification: string | null
  ai_confidence: number | null
  ai_extracted_fields: Record<string, unknown> | null
  ai_missing_fields: string[] | null
  booking_id: string | null
  processed: boolean
  received_at: string
}

export interface MessageTemplate {
  id: string
  template_key: string
  name: string
  channel: MessageChannel | 'both'
  subject: string | null
  body: string
  is_active: boolean
  updated_at: string
}

export interface ConversationMessage {
  role: 'client' | 'agent'
  content: string
  timestamp: string
}

export interface ConversationSession {
  id: string
  phone: string
  client_id: string | null
  status: 'collecting' | 'complete' | 'abandoned'
  messages: ConversationMessage[]
  extracted: Record<string, unknown>
  missing_fields: string[]
  booking_id: string | null
  created_at: string
  updated_at: string
}
