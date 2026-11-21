// واسط Cloudflare Worker برای ربات تلگرام
// تلگرام پیام‌ها را (وب‌هوک) اینجا می‌فرستد و در KV نگه می‌دارد؛ برنامه هر وقت باز شد آن‌ها را می‌گیرد.
// متغیر محرمانهٔ SECRET و اتصال KV با نام UPDATES لازم است (README را ببینید).
const TTL = 60 * 60 * 24 * 7;           // نگهداری ۷ روزه
const pad = n => String(n).padStart(12, '0');
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...cors } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.SECRET || !env.UPDATES) return json({ ok: false, error: 'SECRET یا UPDATES تنظیم نشده است' }, 500);

    // ورودی از تلگرام
    if (url.pathname === '/hook' && req.method === 'POST') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.SECRET) return json({ ok: false }, 403);
      let u; try { u = await req.json(); } catch { return json({ ok: false }, 400); }
      if (typeof u.update_id !== 'number') return json({ ok: false }, 400);
      await env.UPDATES.put('u:' + pad(u.update_id), JSON.stringify(u), { expirationTtl: TTL });
      return json({ ok: true });
    }

    // خروجی به برنامه
    if ((req.headers.get('authorization') || '') !== 'Bearer ' + env.SECRET) return json({ ok: false, error: 'کلید نامعتبر' }, 401);

    if (url.pathname === '/updates' && req.method === 'GET') {
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const out = [];
      let cursor;
      do {
        const l = await env.UPDATES.list({ prefix: 'u:', cursor, limit: 1000 });
        for (const k of l.keys) {
          if (Number(k.name.slice(2)) < offset) continue;
          if (out.length >= 100) break;
          const v = await env.UPDATES.get(k.name);
          if (v) out.push(JSON.parse(v));
        }
        cursor = l.list_complete || out.length >= 100 ? undefined : l.cursor;
      } while (cursor);
      out.sort((a, b) => a.update_id - b.update_id);
      return json({ ok: true, result: out });
    }

    // دانلود فایل تلگرام برای برنامه (مرورگر اجازهٔ دانلود مستقیم از تلگرام را نمی‌دهد)؛ نیازمند BOT_TOKEN
    if (url.pathname === '/file' && req.method === 'GET') {
      if (!env.BOT_TOKEN) return json({ ok: false, error: 'BOT_TOKEN روی Worker تنظیم نشده است' }, 501);
      const id = url.searchParams.get('file_id');
      if (!id) return json({ ok: false, error: 'file_id لازم است' }, 400);
      const info = await (await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(id)}`)).json().catch(() => ({}));
      if (!info.ok || !info.result || !info.result.file_path) return json({ ok: false, error: info.description || 'فایل پیدا نشد' }, 404);
      const f = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
      if (!f.ok) return json({ ok: false, error: 'دانلود از تلگرام ناموفق بود (' + f.status + ')' }, 502);
      return new Response(f.body, { status: 200, headers: { 'content-type': f.headers.get('content-type') || 'application/octet-stream', ...cors } });
    }

    if (url.pathname === '/ack' && req.method === 'POST') {
      const upto = Number(url.searchParams.get('upto'));
      if (!Number.isFinite(upto)) return json({ ok: false, error: 'upto نامعتبر' }, 400);
      let cursor, n = 0;
      do {
        const l = await env.UPDATES.list({ prefix: 'u:', cursor, limit: 1000 });
        for (const k of l.keys) if (Number(k.name.slice(2)) <= upto) { await env.UPDATES.delete(k.name); n++; }
        cursor = l.list_complete ? undefined : l.cursor;
      } while (cursor);
      return json({ ok: true, deleted: n });
    }
    return json({ ok: true, service: 'tg-relay' });
  },
};
