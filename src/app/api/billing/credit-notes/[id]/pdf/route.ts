/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { CreditNotePDF } from '@/components/billing/CreditNotePDF'

function getLogoDataUri(): string | undefined {
  const logoPath = join(process.cwd(), 'public', 'jms-logo.png')
  if (!existsSync(logoPath)) return undefined
  return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: cn, error }, { data: lineItems }] = await Promise.all([
    supabase.from('credit_notes')
      .select('*, company:companies!company_id(name, gstin, address), invoice:invoices!invoice_id(invoice_number, period_from, period_to)')
      .eq('id', id).single(),
    supabase.from('credit_note_line_items').select('*').eq('credit_note_id', id).order('sort_order', { ascending: true }),
  ])

  if (error || !cn) return NextResponse.json({ error: 'Credit note not found' }, { status: 404 })

  const logoSrc = getLogoDataUri()

  // Cast matches the pattern used in InvoicePDF route — react-pdf types don't align with createElement
  const buf = await renderToBuffer(
    createElement(CreditNotePDF, {
      logoSrc,
      cn_number:    cn.cn_number ?? 'DRAFT',
      created_at:   cn.created_at,
      issued_at:    cn.issued_at ?? null,
      reason:       cn.reason,
      notes:        cn.notes ?? null,
      invoice_number: (cn.invoice as { invoice_number?: string | null } | null)?.invoice_number ?? null,
      company:      cn.company as { name: string; gstin?: string | null; address?: string | null } | null,
      subtotal:     cn.subtotal,
      cgst_amount:  cn.cgst_amount,
      sgst_amount:  cn.sgst_amount,
      igst_amount:  cn.igst_amount,
      total_amount: cn.total_amount,
      line_items:   (lineItems ?? []).map(li => ({
        booking_ref:  li.booking_ref ?? null,
        description:  li.description,
        amount:       li.amount,
        cgst_rate:    li.cgst_rate,
        sgst_rate:    li.sgst_rate,
        igst_rate:    li.igst_rate,
        cgst_amount:  li.cgst_amount,
        sgst_amount:  li.sgst_amount,
        igst_amount:  li.igst_amount,
        line_total:   li.line_total,
      })),
    }) as any
  )

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${cn.cn_number ?? 'DRAFT-CN'}.pdf"`,
    },
  })
}
