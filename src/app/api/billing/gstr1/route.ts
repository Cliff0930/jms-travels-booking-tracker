import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, period_from, period_to, created_at, grand_total, subtotal, cgst_amount, sgst_amount, igst_amount, tds_amount, status, reverse_charge, company_id, individual_gstin, addressee_name, addressee_prefix, company:companies!company_id(name, gstin, address)')
    .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])
    .or(`period_from.like.${month}%,period_to.like.${month}%`)
    .order('created_at', { ascending: true })

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  const { data: creditNotes, error: cnErr } = await supabase
    .from('credit_notes')
    .select('id, cn_number, created_at, total_amount, subtotal, cgst_amount, sgst_amount, igst_amount, status, company_id, company:companies!company_id(name, gstin), invoice:invoices!invoice_id(invoice_number)')
    .in('status', ['issued'])
    .like('created_at', `${month}%`)

  if (cnErr) return NextResponse.json({ error: cnErr.message }, { status: 500 })

  const allInvoices = invoices ?? []

  // B2B: invoices to GSTIN-registered recipients
  const b2b = allInvoices.filter(inv => {
    const gstin = (inv.company as { gstin?: string | null } | null)?.gstin
    return !!(gstin && gstin.length === 15)
  }).map(inv => {
    const company = inv.company as { name?: string; gstin?: string; address?: string } | null
    const taxableValue = Number(inv.subtotal ?? 0)
    const cgst = Number(inv.cgst_amount ?? 0)
    const sgst = Number(inv.sgst_amount ?? 0)
    const igst = Number(inv.igst_amount ?? 0)
    const rate = igst > 0 ? 5 : cgst > 0 ? 5 : 0
    return {
      gstin_of_recipient: company?.gstin ?? '',
      receiver_name: company?.name ?? '',
      invoice_number: inv.invoice_number ?? '',
      invoice_date: inv.created_at?.slice(0, 10) ?? '',
      invoice_value: Number(inv.grand_total ?? 0),
      place_of_supply: '29', // Karnataka — update if multi-state
      reverse_charge: inv.reverse_charge ? 'Y' : 'N',
      invoice_type: 'Regular',
      rate,
      taxable_value: taxableValue,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      cess_amount: 0,
    }
  })

  // B2CS: invoices to unregistered (no GSTIN) or individual
  const b2cs = allInvoices.filter(inv => {
    const gstin = (inv.company as { gstin?: string | null } | null)?.gstin
    const indGstin = inv.individual_gstin
    return !(gstin && gstin.length === 15) && !(indGstin && indGstin.length === 15)
  }).map(inv => {
    const taxableValue = Number(inv.subtotal ?? 0)
    const cgst = Number(inv.cgst_amount ?? 0)
    const sgst = Number(inv.sgst_amount ?? 0)
    const igst = Number(inv.igst_amount ?? 0)
    const rate = igst > 0 ? 5 : cgst > 0 ? 5 : 0
    return {
      type: 'OE',
      place_of_supply: '29',
      rate,
      taxable_value: taxableValue,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      cess_amount: 0,
    }
  })

  // CDNR: credit notes to GSTIN-registered recipients
  const cdnr = (creditNotes ?? []).filter(cn => {
    const gstin = (cn.company as { gstin?: string | null } | null)?.gstin
    return !!(gstin && gstin.length === 15)
  }).map(cn => {
    const company = cn.company as { name?: string; gstin?: string } | null
    const invoice = cn.invoice as { invoice_number?: string } | null
    return {
      gstin_of_recipient: company?.gstin ?? '',
      receiver_name: company?.name ?? '',
      cn_number: cn.cn_number ?? '',
      cn_date: cn.created_at?.slice(0, 10) ?? '',
      note_type: 'C', // Credit note
      place_of_supply: '29',
      reverse_charge: 'N',
      original_invoice_number: invoice?.invoice_number ?? '',
      original_invoice_date: '',
      invoice_value: Number(cn.total_amount ?? 0),
      rate: 5,
      taxable_value: Number(cn.subtotal ?? 0),
      cgst_amount: Number(cn.cgst_amount ?? 0),
      sgst_amount: Number(cn.sgst_amount ?? 0),
      igst_amount: Number(cn.igst_amount ?? 0),
      cess_amount: 0,
    }
  })

  // HSN/SAC summary
  const totalTaxable = allInvoices.reduce((s, i) => s + Number(i.subtotal ?? 0), 0)
  const totalCgst    = allInvoices.reduce((s, i) => s + Number(i.cgst_amount ?? 0), 0)
  const totalSgst    = allInvoices.reduce((s, i) => s + Number(i.sgst_amount ?? 0), 0)
  const totalIgst    = allInvoices.reduce((s, i) => s + Number(i.igst_amount ?? 0), 0)
  const hsn = [{
    sac_code: '996601',
    description: 'Motor vehicle transport services',
    uqc: 'OTH',
    total_quantity: allInvoices.length,
    total_value: allInvoices.reduce((s, i) => s + Number(i.grand_total ?? 0), 0),
    taxable_value: totalTaxable,
    rate: 5,
    cgst_amount: totalCgst,
    sgst_amount: totalSgst,
    igst_amount: totalIgst,
    cess_amount: 0,
  }]

  return NextResponse.json({
    month,
    b2b,
    b2cs,
    cdnr,
    hsn,
    summary: {
      total_invoices: allInvoices.length,
      b2b_count: b2b.length,
      b2cs_count: b2cs.length,
      cdnr_count: cdnr.length,
      total_taxable: totalTaxable,
      total_cgst: totalCgst,
      total_sgst: totalSgst,
      total_igst: totalIgst,
      total_tax: totalCgst + totalSgst + totalIgst,
      gross_turnover: allInvoices.reduce((s, i) => s + Number(i.grand_total ?? 0), 0),
    },
  })
}
