import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function usedPage() {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta charset="utf-8">
    <title>Link Expired — JMS Travels</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF8FF;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box}
      .card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;max-width:360px;width:100%;border:1px solid #E5E7EB}
      .icon{font-size:52px;margin-bottom:16px}
      h2{color:#374151;font-size:20px;margin:0 0 10px;font-weight:600}
      p{color:#6B7280;line-height:1.6;margin:0;font-size:15px}
    </style>
    </head><body>
    <div class="card">
      <div class="icon">🔒</div>
      <h2>Link Already Used</h2>
      <p>This link has already been used and is no longer active.<br><br>For any queries, please contact JMS Travels directly.</p>
    </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

function notFoundPage() {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta charset="utf-8">
    <title>Invalid Link — JMS Travels</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FAF8FF;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box}
      .card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;max-width:360px;width:100%;border:1px solid #E5E7EB}
      .icon{font-size:52px;margin-bottom:16px}
      h2{color:#374151;font-size:20px;margin:0 0 10px;font-weight:600}
      p{color:#6B7280;line-height:1.6;margin:0;font-size:15px}
    </style>
    </head><body>
    <div class="card">
      <div class="icon">❓</div>
      <h2>Invalid Link</h2>
      <p>This link is not valid. Please use the link sent to you by JMS Travels.</p>
    </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = createAdminClient()

  const { data: link } = await supabase
    .from('short_links')
    .select('target_url, used_at')
    .eq('code', code)
    .single()

  if (!link) return notFoundPage()
  if (link.used_at) return usedPage()

  const separator = link.target_url.includes('?') ? '&' : '?'
  return NextResponse.redirect(`${link.target_url}${separator}link_code=${code}`)
}
