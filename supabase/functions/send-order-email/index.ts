// ════════════════════════════════════════════════════════════════════════
//  send-order-email
//  ──────────────────────────────────────────────────────────────────────
//  Sends a confirmation email to the customer + a notification to the
//  admin (store@darolfath.com) for any new order.
//
//  Uses Gmail SMTP — requires GMAIL_USER and GMAIL_APP_PASSWORD secrets.
//
//  Trigger: called from check-paymob-transaction (on payment success) and
//  from create-storefront-order (for COD).
// ════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GMAIL_USER         = Deno.env.get('GMAIL_USER')         ?? '';
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? '';
const ADMIN_EMAIL        = Deno.env.get('ADMIN_EMAIL')        ?? 'store@darolfath.com';
const SITE_URL           = Deno.env.get('SITE_URL')           ?? 'https://dar-alfath-client.vercel.app';
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '';

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatMoney(n: number, currency = 'ج.م'): string {
  const value = Number(n || 0);
  return `${value.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── HTML email template (RTL, Arabic) ────────────────────────────────
type OrderItem = {
  product_title: string;
  variant_name:  string;
  quantity:      number;
  price_per_item: number;
};

type OrderData = {
  id:             string;
  total_price:    number;
  shipping_cost:  number;
  discount_amount: number;
  payment_status: string;
  payment_method_name: string;
  customer_name:  string;
  customer_email: string;
  customer_phone: string;
  shipping_address_full: string;
  items:          OrderItem[];
  currency:       string;
  is_paid:        boolean;
};

function buildEmailHtml(order: OrderData, audience: 'customer' | 'admin'): string {
  const subtotal = order.items.reduce((s, i) => s + i.price_per_item * i.quantity, 0);
  const paidBadge = order.is_paid
    ? '<span style="background:#dcfce7;color:#166534;padding:4px 10px;border-radius:12px;font-size:13px">✓ تم الدفع</span>'
    : '<span style="background:#fef3c7;color:#92400e;padding:4px 10px;border-radius:12px;font-size:13px">الدفع عند الاستلام</span>';

  const headerText = audience === 'customer'
    ? (order.is_paid ? 'شكراً لطلبك! تم تأكيد دفعتك' : 'شكراً لطلبك! تم استلامه')
    : 'طلب جديد من العميل';

  const introText = audience === 'customer'
    ? (order.is_paid
        ? `أهلاً ${escapeHtml(order.customer_name)},<br>تم استلام دفعتك بنجاح وسنبدأ تجهيز طلبك قريباً.`
        : `أهلاً ${escapeHtml(order.customer_name)},<br>استلمنا طلبك وسنتواصل معك قبل التوصيل.`)
    : `وصل طلب جديد من <strong>${escapeHtml(order.customer_name)}</strong> (${escapeHtml(order.customer_email)})`;

  const itemsRows = order.items.map((it) => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:right">
        <strong>${escapeHtml(it.product_title)}</strong>
        <div style="color:#64748b;font-size:13px;margin-top:2px">${escapeHtml(it.variant_name)}</div>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:center;width:60px">${it.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;text-align:left;width:120px;white-space:nowrap">
        ${formatMoney(it.price_per_item * it.quantity, order.currency)}
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(headerText)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:0 auto;padding:24px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);color:white;padding:28px 24px;border-radius:16px 16px 0 0;text-align:center">
    <h1 style="margin:0 0 8px;font-size:22px">دار الفتح للنشر والتوزيع</h1>
    <p style="margin:0;opacity:.9;font-size:14px">${escapeHtml(headerText)}</p>
  </div>

  <!-- Body -->
  <div style="background:white;padding:28px 24px;border:1px solid #e2e8f0">
    <p style="margin:0 0 16px;line-height:1.7;color:#334155">${introText}</p>

    <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;padding:16px;border-radius:12px;margin:20px 0">
      <div style="flex:1">
        <div style="font-size:12px;color:#64748b">رقم الطلب</div>
        <div style="font-weight:700;font-family:monospace;margin-top:2px">${escapeHtml(order.id)}</div>
      </div>
      <div>${paidBadge}</div>
    </div>

    <!-- Items -->
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 8px;text-align:right;font-size:13px;color:#475569">المنتج</th>
          <th style="padding:10px 8px;text-align:center;font-size:13px;color:#475569;width:60px">الكمية</th>
          <th style="padding:10px 8px;text-align:left;font-size:13px;color:#475569;width:120px">السعر</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-top:20px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;color:#475569">
        <span>الإجمالي الفرعي</span>
        <span>${formatMoney(subtotal, order.currency)}</span>
      </div>
      ${order.discount_amount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;color:#16a34a">
        <span>الخصم</span>
        <span>- ${formatMoney(order.discount_amount, order.currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:6px 0;color:#475569">
        <span>الشحن</span>
        <span>${order.shipping_cost > 0 ? formatMoney(order.shipping_cost, order.currency) : 'مجاني'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 0 6px;border-top:2px dashed #cbd5e1;margin-top:8px;font-weight:700;font-size:17px">
        <span>الإجمالي النهائي</span>
        <span>${formatMoney(order.total_price, order.currency)}</span>
      </div>
    </div>

    <!-- Customer info (admin only) -->
    ${audience === 'admin' ? `
    <div style="background:#fef3c7;border-radius:12px;padding:16px;margin-top:20px;border:1px solid #fde68a">
      <h3 style="margin:0 0 12px;font-size:14px;color:#92400e">بيانات العميل</h3>
      <div style="font-size:13px;line-height:1.8;color:#451a03">
        <div><strong>الاسم:</strong> ${escapeHtml(order.customer_name)}</div>
        <div><strong>الإيميل:</strong> ${escapeHtml(order.customer_email)}</div>
        <div><strong>الهاتف:</strong> ${escapeHtml(order.customer_phone)}</div>
        <div><strong>العنوان:</strong> ${escapeHtml(order.shipping_address_full)}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #fde68a">
          <strong>طريقة الدفع:</strong> ${escapeHtml(order.payment_method_name)}
        </div>
      </div>
    </div>` : ''}

    <!-- CTA -->
    ${audience === 'customer' ? `
    <div style="text-align:center;margin-top:24px">
      <a href="${SITE_URL}/account/orders" style="display:inline-block;background:#1e40af;color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600">
        عرض طلباتي
      </a>
    </div>` : `
    <div style="text-align:center;margin-top:24px">
      <a href="${SITE_URL.replace('client','dashboard')}/orders" style="display:inline-block;background:#1e40af;color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600">
        فتح الطلب في لوحة التحكم
      </a>
    </div>`}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px;color:#64748b;font-size:12px;background:white;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none">
    <p style="margin:0">دار الفتح للنشر والتوزيع — ${new Date().getFullYear()}</p>
  </div>

</div>
</body>
</html>`;
}

// ── SMTP send ────────────────────────────────────────────────────────
async function sendViaSmtp(to: string, subject: string, html: string) {
  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port:     465,
      tls:      true,
      auth: {
        username: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
      },
    },
  });

  try {
    await client.send({
      // ASCII-only display name — see the subjectCustomer/subjectAdmin note
      // above for why (denomailer mis-folds non-ASCII headers).
      from:    `Dar Alfath <${GMAIL_USER}>`,
      to,
      subject,
      content: 'text/html',
      html,
    });
  } finally {
    await client.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fail CLOSED: reject if the internal secret is not configured, or wrong.
    const receivedSecret = req.headers.get('x-internal-function-secret') ?? '';
    if (!INTERNAL_FUNCTION_SECRET || receivedSecret !== INTERNAL_FUNCTION_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.warn('[email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping');
      return jsonOk({ skipped: true, reason: 'gmail credentials missing' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { orderId } = (await req.json()) as { orderId: string };
    if (!orderId) {
      return jsonOk({ error: 'orderId مطلوب' });
    }

    // Fetch the full order with joins
    const { data: orderRow, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        id, total_price, shipping_cost, discount_amount, payment_status,
        shipping_address, notes,
        countries(name, currency_symbol),
        payment_methods(method_name, provider),
        order_items(
          quantity, price_per_item,
          products(title),
          product_variants(variant_name)
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr || !orderRow) {
      console.error('[email] order fetch error:', fetchErr);
      return jsonOk({ error: 'لم نجد الطلب' });
    }

    const ship = (orderRow.shipping_address ?? {}) as Record<string, string>;
    const shipFull = [ship.country, ship.governorate, ship.city, ship.street].filter(Boolean).join(' — ');

    const orderData: OrderData = {
      id: orderRow.id,
      total_price:     Number(orderRow.total_price) || 0,
      shipping_cost:   Number(orderRow.shipping_cost) || 0,
      discount_amount: Number(orderRow.discount_amount) || 0,
      payment_status:  orderRow.payment_status ?? 'pending',
      payment_method_name: (orderRow.payment_methods as { method_name?: string } | null)?.method_name ?? 'غير محدد',
      customer_name:   ship.name  ?? 'عميل',
      customer_email:  ship.email ?? '',
      customer_phone:  ship.phone ?? '',
      shipping_address_full: shipFull,
      items: ((orderRow.order_items ?? []) as Array<{
        quantity: number;
        price_per_item: number;
        products: { title?: string } | null;
        product_variants: { variant_name?: string } | null;
      }>).map((i) => ({
        product_title:  i.products?.title ?? 'منتج',
        variant_name:   i.product_variants?.variant_name ?? '',
        quantity:       i.quantity,
        price_per_item: Number(i.price_per_item) || 0,
      })),
      currency: (orderRow.countries as { currency_symbol?: string } | null)?.currency_symbol ?? 'ج.م',
      is_paid:  orderRow.payment_status === 'مدفوع',
    };

    // ASCII-only subjects — denomailer's header encoder mis-folds long
    // non-ASCII Subject/From values (confirmed live: an Arabic subject
    // arrived as raw undecoded quoted-printable, corrupting the whole
    // message). The Arabic copy lives in the HTML body instead, which isn't
    // subject to this header-folding bug. subjectAdmin in particular used to
    // interpolate the customer's (Arabic) name directly into the subject,
    // which made it especially likely to trip this.
    const subjectCustomer = orderData.is_paid
      ? `Dar Alfath - Order #${orderData.id} confirmed`
      : `Dar Alfath - Order #${orderData.id} received`;
    const subjectAdmin = `Dar Alfath - New order #${orderData.id}`;

    const results = { customer: false, admin: false, errors: [] as string[] };

    // Send to customer
    if (orderData.customer_email) {
      try {
        await sendViaSmtp(
          orderData.customer_email,
          subjectCustomer,
          buildEmailHtml(orderData, 'customer'),
        );
        results.customer = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[email] customer send failed:', msg);
        results.errors.push(`customer: ${msg}`);
      }
    }

    // Send to admin
    try {
      await sendViaSmtp(
        ADMIN_EMAIL,
        subjectAdmin,
        buildEmailHtml(orderData, 'admin'),
      );
      results.admin = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[email] admin send failed:', msg);
      results.errors.push(`admin: ${msg}`);
    }

    return jsonOk(results);
  } catch (err) {
    console.error('[email] Unexpected:', err);
    return jsonOk({ error: err instanceof Error ? err.message : 'خطأ غير متوقع' });
  }
});
