import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'
import { findOrCreateGuestClient } from '@/lib/utils/guest-client'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const client_type = searchParams.get('client_type')
  const company_id = searchParams.get('company_id')
  const guest_of_company_id = searchParams.get('guest_of_company_id')
  const company_any = searchParams.get('company_any') // matches company_id OR guest_of_company_id

  let query = supabase
    .from('clients')
    .select('*, company:companies!company_id(id, name), guest_of_company:companies!guest_of_company_id(id, name), contacts:client_contacts(id, value, contact_type, role)')
    .order('name')

  if (q) {
    const normalized = q.toLowerCase().replace(/[^a-z0-9]/g, '')

    const { data: allCompanies } = await supabase.from('companies').select('id, name, aliases')
    const matchingCompanyIds = (allCompanies ?? [])
      .filter(c => {
        const qLower = q.toLowerCase()
        const nameNorm = c.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (c.name.toLowerCase().includes(qLower)) return true
        if (normalized && nameNorm.includes(normalized)) return true
        if (c.aliases?.some((a: string) =>
          a.toLowerCase().includes(qLower) ||
          (normalized && a.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalized))
        )) return true
        return false
      })
      .map(c => c.id)

    let orFilter = `name.ilike.%${q}%,primary_phone.ilike.%${q}%,primary_email.ilike.%${q}%`
    if (matchingCompanyIds.length > 0) {
      const ids = matchingCompanyIds.join(',')
      orFilter += `,company_id.in.(${ids}),guest_of_company_id.in.(${ids})`
    }
    query = query.or(orFilter)
  }
  if (client_type) query = query.eq('client_type', client_type)
  if (company_id) query = query.eq('company_id', company_id)
  if (guest_of_company_id) query = query.eq('guest_of_company_id', guest_of_company_id)
  if (company_any) query = query.or(`company_id.eq.${company_any},guest_of_company_id.eq.${company_any}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()

  if (body.findOrCreate) {
    const { findOrCreate: _, ...rest } = body
    const clientId = await findOrCreateGuestClient(supabase, {
      guestName: rest.name,
      guestPhone: rest.primary_phone ?? null,
      companyId: rest.company_id ?? rest.guest_of_company_id ?? null,
    })
    if (!clientId) return NextResponse.json({ error: 'Failed to find or create guest' }, { status: 500 })
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 200 })
  }

  if (body.primary_phone) body.primary_phone = normalizePhone(body.primary_phone)
  const { data, error } = await supabase.from('clients').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
