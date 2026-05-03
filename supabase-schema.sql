-- JMS Travels — Full Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── COMPANIES ───────────────────────────────────────────────
create table companies (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  aliases             text[] default '{}',
  email_domains       text[] default '{}',
  approver_emails     text[] default '{}',
  approver_whatsapp   text[] default '{}',
  approval_required   boolean default false,
  approval_channel    text default 'email',
  approval_timeout_hours int default 4,
  approval_exclusions text[] default '{}',
  digest_mode         boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── CLIENTS ─────────────────────────────────────────────────
create table clients (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid references companies(id),
  name                text not null,
  primary_phone       text,
  primary_email       text,
  client_type         text default 'corporate',
  designation         text,
  default_pax         int,
  default_vehicle_type text,
  is_verified         boolean default false,
  is_vip              boolean default false,
  company_detection_method text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── CLIENT CONTACTS ──────────────────────────────────────────
create table client_contacts (
  id                  uuid primary key default uuid_generate_v4(),
  client_id           uuid references clients(id) on delete cascade,
  value               text not null,
  contact_type        text not null,
  role                text default 'additional',
  created_at          timestamptz default now()
);

-- ─── CLIENT SAVED LOCATIONS ──────────────────────────────────
create table client_locations (
  id                  uuid primary key default uuid_generate_v4(),
  client_id           uuid references clients(id) on delete cascade,
  keyword             text not null,
  address             text not null,
  created_at          timestamptz default now(),
  unique(client_id, keyword)
);

-- ─── DRIVERS ─────────────────────────────────────────────────
create table drivers (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  phone               text not null,
  email               text,
  vehicle_type        text not null,
  vehicle_name        text not null,
  vehicle_number      text not null,
  vehicle_color       text,
  seating_capacity    int not null,
  status              text default 'available',
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── BOOKINGS ────────────────────────────────────────────────
create table bookings (
  id                  uuid primary key default uuid_generate_v4(),
  booking_ref         text unique not null,
  client_id           uuid references clients(id),
  company_id          uuid references companies(id),
  driver_id           uuid references drivers(id),
  guest_name          text,
  guest_phone         text,
  status              text default 'draft',
  trip_type           text default 'local',
  service_type        text default 'one_way',
  pickup_location     text,
  drop_location       text,
  pickup_date         date,
  pickup_time         time,
  pax_count           int,
  vehicle_type        text,
  total_days          int default 1,
  source              text default 'manual',
  special_instructions text,
  booking_type        text,
  missing_fields      text[] default '{}',
  flags               text[] default '{}',
  approval_status     text,
  approval_method     text,
  approved_by         text,
  approved_at         timestamptz,
  approval_note       text,
  cancelled_reason    text,
  cancelled_at        timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─── BOOKING LEGS (multi-day) ──────────────────────────────
create table booking_legs (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid references bookings(id) on delete cascade,
  driver_id           uuid references drivers(id),
  day_number          int not null,
  leg_date            date not null,
  leg_status          text default 'upcoming',
  created_at          timestamptz default now()
);

-- ─── VEHICLE SWAPS ───────────────────────────────────────────
create table vehicle_swaps (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid references bookings(id) on delete cascade,
  original_driver_id  uuid references drivers(id),
  new_driver_id       uuid references drivers(id),
  reason              text,
  swapped_at          timestamptz default now(),
  swapped_by          text
);

-- ─── APPROVAL LOGS ───────────────────────────────────────────
create table approval_logs (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid references bookings(id) on delete cascade,
  approver_name       text,
  approver_contact    text,
  method              text,
  note                text,
  actioned_by         text,
  created_at          timestamptz default now()
);

-- ─── BOOKING STATUS HISTORY ──────────────────────────────────
create table booking_status_history (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid references bookings(id) on delete cascade,
  old_status          text,
  new_status          text not null,
  changed_by          text default 'system',
  note                text,
  changed_at          timestamptz default now()
);

-- ─── MESSAGE LOGS ────────────────────────────────────────────
create table message_logs (
  id                  uuid primary key default uuid_generate_v4(),
  booking_id          uuid references bookings(id),
  client_id           uuid references clients(id),
  driver_id           uuid references drivers(id),
  channel             text not null,
  direction           text not null,
  sender              text,
  recipient           text,
  content             text not null,
  template_used       text,
  status              text default 'sent',
  sent_at             timestamptz default now()
);

-- ─── RAW MESSAGES ────────────────────────────────────────────
create table raw_messages (
  id                  uuid primary key default uuid_generate_v4(),
  channel             text not null,
  sender_phone        text,
  sender_email        text,
  sender_name         text,
  cc_emails           text[] default '{}',
  reply_to_emails     text[] default '{}',
  raw_content         text not null,
  ai_classification   text,
  ai_confidence       float,
  ai_extracted_fields jsonb,
  ai_missing_fields   text[],
  booking_id          uuid references bookings(id),
  processed           boolean default false,
  received_at         timestamptz default now()
);

-- ─── MESSAGE TEMPLATES ───────────────────────────────────────
create table message_templates (
  id                  uuid primary key default uuid_generate_v4(),
  template_key        text unique not null,
  name                text not null,
  channel             text not null,
  subject             text,
  body                text not null,
  is_active           boolean default true,
  updated_at          timestamptz default now()
);

-- ─── INDEXES ─────────────────────────────────────────────────
create index on bookings(status);
create index on bookings(client_id);
create index on bookings(driver_id);
create index on bookings(pickup_date);
create index on bookings(company_id);
create index on clients(primary_phone);
create index on clients(primary_email);
create index on clients(company_id);
create index on message_logs(booking_id);
create index on message_logs(client_id);
create index on raw_messages(sender_phone);
create index on raw_messages(sender_email);

-- ─── REALTIME ────────────────────────────────────────────────
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table message_logs;

-- ─── DEFAULT TEMPLATES ───────────────────────────────────────
insert into message_templates (template_key, name, channel, subject, body) values

('booking_received', 'Booking Received Confirmation', 'both',
 'Your booking request has been received — JMS Travels',
 'Hi {client_name}, thank you for your booking request. We have received your details and will confirm your booking shortly. Your reference is {booking_ref}. — JMS Travels Team'),

('missing_info_request', 'Missing Information Request', 'both',
 'We need a few more details for your booking — JMS Travels',
 'Hi {client_name}, thank you for reaching out. To complete your booking we need the following: {missing_fields_list}. Please reply with these details and we will confirm right away. — JMS Travels Team'),

('approval_request', 'Booking Approval Request', 'both',
 'Approval needed: Booking {booking_ref} — JMS Travels',
 'Hi {approver_name}, a booking has been raised for your approval. Booking Ref: {booking_ref}. Guest: {guest_name}. Pickup: {pickup_location}. Date & Time: {pickup_date} at {pickup_time}. Please reply APPROVE {booking_ref} to confirm or REJECT {booking_ref} to decline. — JMS Travels Team'),

('approval_chase', 'Approval Follow-up', 'both',
 'Reminder: Approval pending for {booking_ref} — JMS Travels',
 'Hi {approver_name}, this is a gentle reminder that booking {booking_ref} is still awaiting your approval. Pickup: {pickup_date} at {pickup_time}. Please reply APPROVE {booking_ref} at your earliest convenience. — JMS Travels Team'),

('verbal_approval_ack', 'Verbal Approval Acknowledgement', 'both',
 'Booking {booking_ref} initiated based on verbal approval — JMS Travels',
 'Hi {approver_name}, as discussed on call, we have initiated booking {booking_ref} for {guest_name} on {pickup_date} based on your verbal approval. Please reply CONFIRM to acknowledge. — JMS Travels Team'),

('booking_confirmed', 'Booking Confirmed', 'both',
 'Your booking is confirmed — {booking_ref}',
 'Hi {client_name}, your booking {booking_ref} is confirmed for {pickup_date} at {pickup_time} from {pickup_location}. We will share your driver details shortly. — JMS Travels Team'),

('driver_details_to_client', 'Driver Details to Client', 'both',
 'Your driver details — Booking {booking_ref}',
 'Hi {client_name}, your driver for booking {booking_ref} on {pickup_date} at {pickup_time}:

Driver: {driver_name}
Phone: {driver_phone}
Vehicle: {vehicle_name} ({vehicle_color})
Plate: {vehicle_number}
Reporting at: {pickup_location} by {pickup_time}

Please contact the driver directly if needed. — JMS Travels Team'),

('trip_brief_to_driver', 'Trip Brief to Driver', 'whatsapp',
 null,
 'Hi {driver_name}, you have a new assignment.

Booking: {booking_ref}
Guest: {guest_name}
Guest Phone: {guest_phone}
Pickup: {pickup_location}
Drop: {drop_location}
Date: {pickup_date}
Time: {pickup_time}
Pax: {pax_count}

Please confirm receipt. Tap below to update status:
Arrived: {arrived_link}
Completed: {completed_link}
— JMS Travels'),

('cancellation_client', 'Cancellation Confirmation to Client', 'both',
 'Booking {booking_ref} has been cancelled — JMS Travels',
 'Hi {client_name}, your booking {booking_ref} scheduled for {pickup_date} at {pickup_time} has been cancelled as requested. If you need to rebook please reach out to us. — JMS Travels Team'),

('cancellation_driver', 'Cancellation Notice to Driver', 'whatsapp',
 null,
 'Hi {driver_name}, booking {booking_ref} for {pickup_date} at {pickup_time} has been cancelled. You are now available for new assignments. — JMS Travels'),

('substitute_vehicle_client', 'Substitute Vehicle Notification', 'both',
 'Updated driver details for your booking {booking_ref}',
 'Hi {client_name}, we have made a vehicle change for your booking {booking_ref}. Your updated driver details:

Driver: {driver_name}
Phone: {driver_phone}
Vehicle: {vehicle_name} ({vehicle_color})
Plate: {vehicle_number}
We apologise for any inconvenience. — JMS Travels Team');

-- ─── CONVERSATION SESSIONS ───────────────────────────────────
-- Run this migration in Supabase SQL Editor
create table if not exists conversation_sessions (
  id               uuid primary key default uuid_generate_v4(),
  phone            text not null,
  client_id        uuid references clients(id),
  status           text default 'collecting',  -- collecting | awaiting_ack | complete | abandoned
  messages         jsonb default '[]',         -- [{role, content, timestamp}]
  extracted        jsonb default '{}',         -- accumulated extracted fields
  missing_fields   text[] default '{}',
  booking_id       uuid references bookings(id),
  completed_at     timestamptz,               -- when all fields were collected (start of 15s ack window)
  last_message_at  timestamptz default now(),  -- when last client message arrived
  pending_process  boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Migration: run this if the table already exists
-- ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;

create index if not exists idx_conv_sessions_phone_status
  on conversation_sessions(phone, status);

grant all on conversation_sessions to postgres, anon, authenticated, service_role;
grant all on message_logs to postgres, anon, authenticated, service_role;

-- ─── USER PROFILES ───────────────────────────────────────────
create table if not exists user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  role        text not null default 'viewer' check (role in ('admin', 'operator', 'viewer')),
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

grant all on user_profiles to postgres, anon, authenticated, service_role;

-- ─── BOOTSTRAP FIRST ADMIN ───────────────────────────────────
-- After running this schema, promote your account to admin:
-- insert into user_profiles (id, email, name, role)
-- select id, email, raw_user_meta_data->>'name', 'admin'
-- from auth.users where email = 'your@email.com'
-- on conflict (id) do update set role = 'admin';

-- ─── MIGRATIONS (run if tables already exist) ────────────────
-- ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type text;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_exclusions text[] DEFAULT '{}';
-- Run these in Supabase SQL Editor to update the live templates:
-- UPDATE message_templates SET subject = replace(subject, 'CabFlow', 'JMS Travels'), body = replace(body, 'CabFlow Team', 'JMS Travels Team'), body = replace(body, '— CabFlow', '— JMS Travels') WHERE subject LIKE '%CabFlow%' OR body LIKE '%CabFlow%';
