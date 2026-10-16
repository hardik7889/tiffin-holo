// Netlify Function: order API for Tiffin Holo
// POST /api/orders   -> create an order, notify owner (Telegram + WhatsApp)
// GET  /api/orders   -> list orders (owner only, hash-gated)
// DELETE /api/orders -> delete one order or all (owner only)

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const STORE = 'tiffin-orders';
const KEY = 'orders';
const SALT = process.env.ADMIN_SALT || 'th$2025$holo';

// Owner credentials live only as SHA-256 digests in the environment.
// The browser sends the typed ID/password over HTTPS; we hash here and compare,
// so the digests embedded in the page cannot be replayed against this API.
const ADMIN_ID_HASH = (process.env.ADMIN_ID_HASH || '').toLowerCase();
const ADMIN_PWD_HASH = (process.env.ADMIN_PWD_HASH || '').toLowerCase();

function sha256(s) {
  return crypto.createHash('sha256').update(SALT + s, 'utf8').digest('hex');
}

function normId(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const CMB_PHONE = process.env.CALLMEBOT_PHONE || '';
const CMB_KEY = process.env.CALLMEBOT_APIKEY || '';

const json = (status, body) => ({
  statusCode: status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-th-id, x-th-pwd',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  },
  body: JSON.stringify(body),
});

function getOrderStore() {
  return getStore({
    name: STORE,
    siteID: process.env.NETLIFY_SITE_ID || 'a78485a2-f9ef-403e-af38-b1c3918d766d',
    token: process.env.NETLIFY_API_TOKEN
  });
}

async function readOrders() {
  try {
    const store = getOrderStore();
    const raw = await store.get(KEY, { type: 'json' });
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

async function writeOrders(list) {
  const store = getOrderStore();
  await store.setJSON(KEY, list);
}

function isOwner(event) {
  const h = event.headers || {};
  const id = normId(h['x-th-id'] || h['X-Th-Id'] || '');
  const pw = String(h['x-th-pwd'] || h['X-Th-Pwd'] || '');
  if (!ADMIN_ID_HASH || !ADMIN_PWD_HASH) return false;
  const idOk = sha256(id) === ADMIN_ID_HASH;
  const pwOk = sha256(pw) === ADMIN_PWD_HASH;
  return idOk && pwOk;
}

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max || 300);
}

function orderText(o) {
  return [
    '🍱 NEW TIFFIN ORDER',
    '',
    'Order ID: ' + o.id,
    'Naam: ' + (o.name || '—'),
    'Phone: ' + (o.phone || '—'),
    'Address: ' + (o.address || '—'),
    'Package: ' + (o.pkg || '—'),
    o.note ? 'Note: ' + o.note : null,
    '',
    'Time: ' + new Date(o.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  ].filter(Boolean).join('\n');
}

async function notifyTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return 'skipped';
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    });
    return r.ok ? 'sent' : 'http_' + r.status;
  } catch (e) {
    return 'error';
  }
}

async function notifyWhatsApp(text) {
  if (!CMB_PHONE || !CMB_KEY) return 'skipped';
  try {
    const url = 'https://api.callmebot.com/whatsapp.php'
      + '?phone=' + encodeURIComponent(CMB_PHONE)
      + '&text=' + encodeURIComponent(text)
      + '&apikey=' + encodeURIComponent(CMB_KEY);
    const r = await fetch(url);
    return r.ok ? 'sent' : 'http_' + r.status;
  } catch (e) {
    return 'error';
  }
}

exports.handler = async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') return json(204, {});

  // ---------- create ----------
  if (method === 'POST') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { ok: false, error: 'bad_json' });
    }

    const name = clean(body.name, 80);
    const phone = clean(body.phone, 20);
    if (!name || !phone) return json(400, { ok: false, error: 'name_phone_required' });

    const order = {
      id: 'TH-' + Date.now().toString(36).toUpperCase() + '-'
        + Math.random().toString(36).slice(2, 6).toUpperCase(),
      at: new Date().toISOString(),
      name,
      phone,
      address: clean(body.address, 400),
      pkg: clean(body.pkg, 120),
      note: clean(body.note, 300),
      status: 'pending',
      statusHistory: [{ status: 'pending', at: new Date().toISOString() }],
    };

    const list = await readOrders();
    list.unshift(order);
    // keep the store bounded
    await writeOrders(list.slice(0, 500));

    const text = orderText(order);
    const [tg, wa] = await Promise.all([notifyTelegram(text), notifyWhatsApp(text)]);

    return json(200, { ok: true, id: order.id, notified: { telegram: tg, whatsapp: wa } });
  }

  // ---------- owner-only routes ----------
  if (!isOwner(event)) return json(401, { ok: false, error: 'unauthorized' });

  if (method === 'GET') {
    const list = await readOrders();
    return json(200, { ok: true, orders: list, count: list.length });
  }

  if (method === 'PUT') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {}

    const id = clean(body.id, 60);
    const newStatus = clean(body.status, 20).toLowerCase();

    if (!id) return json(400, { ok: false, error: 'id_required' });

    const validStatuses = ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      return json(400, { ok: false, error: 'invalid_status', valid: validStatuses });
    }

    const list = await readOrders();
    const order = list.find((o) => o.id === id);

    if (!order) return json(404, { ok: false, error: 'not_found' });

    order.status = newStatus;
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({ status: newStatus, at: new Date().toISOString() });

    await writeOrders(list);
    return json(200, { ok: true, id, status: newStatus });
  }

  if (method === 'DELETE') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {}

    const list = await readOrders();

    if (body.all === true) {
      await writeOrders([]);
      return json(200, { ok: true, deleted: 'all', remaining: 0 });
    }

    const id = clean(body.id, 60);
    if (!id) return json(400, { ok: false, error: 'id_required' });

    const next = list.filter((o) => o.id !== id);
    if (next.length === list.length) return json(404, { ok: false, error: 'not_found' });
    await writeOrders(next);
    return json(200, { ok: true, deleted: id, remaining: next.length });
  }

  return json(405, { ok: false, error: 'method_not_allowed' });
};
