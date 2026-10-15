// Local harness: exercise every route of the orders function with a mock blob store.
const path = require('path');
const Module = require('module');

// --- mock @netlify/blobs so we can run without the Netlify runtime ---
const mem = {};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@netlify/blobs') return 'MOCK_BLOBS';
  return origResolve.call(this, request, ...rest);
};
require.cache['MOCK_BLOBS'] = {
  id: 'MOCK_BLOBS', filename: 'MOCK_BLOBS', loaded: true,
  exports: {
    getStore: () => ({
      get: async (k) => mem[k] ?? null,
      setJSON: async (k, v) => { mem[k] = v; },
    }),
  },
};

// --- test env ---
const crypto = require('crypto');
const SALT = 'th$2025$holo';
const sha = (s) => crypto.createHash('sha256').update(SALT + s, 'utf8').digest('hex');
process.env.ADMIN_SALT = SALT;
process.env.ADMIN_ID_HASH = sha('tifin holo12');
process.env.ADMIN_PWD_HASH = sha('sharma12@');
// leave Telegram/WhatsApp unset so the notify step reports "skipped"
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.CALLMEBOT_APIKEY;

const fn = require(path.join(__dirname, 'netlify/functions/orders.js')).handler;

const ev = (method, body, headers) => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  headers: headers || {},
});

const owner = { 'x-th-id': 'tifin holo12', 'x-th-pwd': 'sharma12@' };
const badPw = { 'x-th-id': 'tifin holo12', 'x-th-pwd': 'wrong' };

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); }
  };

  console.log('\n--- POST creates an order ---');
  let r = await fn(ev('POST', { name: 'Rahul Sharma', phone: '9876543210', address: 'Sector 12, Noida', pkg: 'Full Day Combo — Monthly (₹4,999)', note: 'Jain' }));
  let b = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, b);
  check('ok true', b.ok === true);
  check('id returned', /^TH-/.test(b.id || ''), b.id);
  check('notify skipped (no keys)', b.notified && b.notified.telegram === 'skipped' && b.notified.whatsapp === 'skipped', b.notified);
  const firstId = b.id;

  console.log('\n--- second order lands on top ---');
  r = await fn(ev('POST', { name: 'Test User', phone: '9999988888', address: 'Delhi', pkg: 'Breakfast — Weekly (₹420)' }));
  b = JSON.parse(r.body);
  check('status 200', r.statusCode === 200);
  const secondId = b.id;

  console.log('\n--- POST validation ---');
  r = await fn(ev('POST', { phone: '123' }));
  b = JSON.parse(r.body);
  check('missing name -> 400', r.statusCode === 400 && b.error === 'name_phone_required', b);
  r = await fn(ev('POST', null));
  check('no body -> 400', r.statusCode === 400);

  console.log('\n--- GET requires owner ---');
  r = await fn(ev('GET'));
  check('no creds -> 401', r.statusCode === 401, r.statusCode);
  r = await fn(ev('GET', null, badPw));
  check('wrong password -> 401', r.statusCode === 401);
  r = await fn(ev('GET', null, { 'x-th-id': 'someoneelse', 'x-th-pwd': 'sharma12@' }));
  check('wrong id -> 401', r.statusCode === 401);

  console.log('\n--- GET with owner creds ---');
  r = await fn(ev('GET', null, owner));
  b = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, b);
  check('2 orders', b.count === 2, b.count);
  check('newest first', b.orders[0].id === secondId, b.orders.map(o => o.id));
  check('all fields stored', b.orders[1].name === 'Rahul Sharma' && b.orders[1].note === 'Jain');

  console.log('\n--- DELETE one ---');
  r = await fn(ev('DELETE', { id: firstId }, owner));
  b = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, b);
  check('remaining 1', b.remaining === 1, b);
  r = await fn(ev('GET', null, owner));
  b = JSON.parse(r.body);
  check('list now 1', b.count === 1, b.count);
  check('deleted id gone', b.orders.every(o => o.id !== firstId));

  console.log('\n--- DELETE unknown id ---');
  r = await fn(ev('DELETE', { id: 'TH-NOPE' }, owner));
  check('404', r.statusCode === 404, r.statusCode);

  console.log('\n--- DELETE all ---');
  r = await fn(ev('DELETE', { all: true }, owner));
  b = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, b);
  check('remaining 0', b.remaining === 0);
  r = await fn(ev('GET', null, owner));
  b = JSON.parse(r.body);
  check('list empty', b.count === 0, b.count);

  console.log('\n--- DELETE needs owner ---');
  r = await fn(ev('DELETE', { all: true }));
  check('no creds -> 401', r.statusCode === 401);

  console.log('\n--- CORS preflight ---');
  r = await fn(ev('OPTIONS'));
  check('204', r.statusCode === 204, r.statusCode);

  console.log('\n' + (fail === 0 ? '✅ ALL PASS' : '❌ FAILURES') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
