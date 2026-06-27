const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function idempotencyKey(email) {
  const day = new Date().toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode(`${email}:${day}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `guide-${hash.slice(0, 48)}`;
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');

  if (origin && origin !== requestUrl.origin) {
    return json({ ok: false, message: 'Request not allowed.' }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, message: 'Please enter a valid email address.' }, 400);
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  const website = String(payload?.website || '').trim();

  // Quietly accept honeypot submissions so bots receive no useful feedback.
  if (website) return json({ ok: true });

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return json({ ok: false, message: 'Please enter a valid email address.' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured.');
    return json({ ok: false, message: 'Email delivery is temporarily unavailable.' }, 503);
  }

  const guideUrl = new URL('/soulsafari-quiz-guide.pdf', requestUrl.origin).toString();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'user-agent': 'SoulSafari-Guide/1.0',
      'idempotency-key': await idempotencyKey(email)
    },
    body: JSON.stringify({
      from: 'SoulSafari <guide@soulsafari.in>',
      to: [email],
      subject: 'Your Self Safari guide',
      text: `Thank you for taking a moment to look inward.\n\nYour Self Safari guide is ready:\n${guideUrl}\n\nTake your time with it. There is no need to solve everything at once.\n\nSoulSafari`,
      html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f0e6;color:#1a1a18;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:42px 24px;">
      <div style="background:#131a16;border-radius:20px;padding:38px;color:#f8f4e9;">
        <p style="margin:0 0 22px;color:#a8c9ac;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">SoulSafari</p>
        <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:34px;font-weight:400;line-height:1.2;">Your Self Safari guide</h1>
        <p style="margin:0 0 26px;color:#d8d8d2;font-size:17px;line-height:1.7;">Thank you for taking a moment to look inward. Your seven-page guide is ready whenever you are.</p>
        <a href="${guideUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#6b9f71;color:#fff;text-decoration:none;font-size:15px;font-weight:600;">Open your guide</a>
        <p style="margin:28px 0 0;color:#a9aaa5;font-size:14px;line-height:1.6;">Take your time with it. There is no need to solve everything at once.</p>
      </div>
      <p style="margin:18px 8px 0;color:#77776f;font-size:12px;line-height:1.5;">You received this because you requested the guide after completing the Self Safari.</p>
    </div>
  </body>
</html>`
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Resend request failed (${response.status}): ${detail.slice(0, 500)}`);
    return json({ ok: false, message: 'The guide could not be sent. Please try again.' }, 502);
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, message: 'Method not allowed.' }, 405);
}
