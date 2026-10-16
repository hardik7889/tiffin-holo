// Real-browser simulation test (normal profile, with cache)
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const PORT = 9222;
const URL = 'https://tiffin-holo.netlify.app/';

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    }).on('error', reject);
  });
}

(async () => {
  let pages = null;
  for (let i = 0; i < 20; i++) {
    try { pages = await httpGet('/json/list'); if (pages.length) break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!pages || !pages.length) { console.log('ERR: no chrome pages'); process.exit(1); }

  let tab = pages.find(p => p.type === 'page' && p.url === 'about:blank') || pages.find(p => p.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let id = 0;
  const pending = {};
  const consoleMsgs = [];
  const exceptions = [];

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Console.messageAdded') {
      const m = msg.params.message;
      if (m.level === 'error' || m.level === 'warning') consoleMsgs.push(`[${m.level}] ${m.text.slice(0, 150)}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      exceptions.push((d.exception && d.exception.description) || d.text);
    }
  });

  const send = (method, params = {}) => new Promise(r => {
    const mid = ++id;
    pending[mid] = r;
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const ev = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true })
    .then(r => r.result.result.value);

  await new Promise(r => ws.on('open', r));

  await send('Page.enable');
  await send('Runtime.enable');

  // Mobile viewport (Android phone) - normal session, no incognito
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });

  console.log('=== Loading site (mobile, normal session) ===');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 12000));

  // Test 1: Page structure
  let r = await ev(`JSON.stringify({
    title: document.title,
    vw: window.innerWidth,
    vh: window.innerHeight,
    docH: document.documentElement.scrollHeight,
    nav: !!document.querySelector('nav'),
    hero: !!document.getElementById('hero'),
    packages: !!document.getElementById('packages'),
    order: !!document.getElementById('order'),
    adminKey: !!document.getElementById('adminKey'),
    mobileNav: !!document.querySelector('.mobile-nav'),
    mobileNavDisplay: document.querySelector('.mobile-nav') ? getComputedStyle(document.querySelector('.mobile-nav')).display : 'N/A',
    installPrompt: !!document.getElementById('installPrompt'),
    orderForm: !!document.getElementById('orderForm'),
    dayCards: document.querySelectorAll('.day-card').length,
    loadedImgs: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth > 0).length,
    totalImgs: document.querySelectorAll('img').length,
    text: document.body.innerText.slice(0, 150)
  })`);
  console.log('\n1. STRUCTURE:');
  try { console.log(JSON.stringify(JSON.parse(r), null, 2)); } catch(e) { console.log(r); }

  // Test 2: Click owner icon
  r = await ev(`document.getElementById('adminKey') ? (document.getElementById('adminKey').click(), 'clicked') : 'not found'`);
  console.log('\n2. Owner icon click:', r);
  await new Promise(r2 => setTimeout(r2, 2000));

  r = await ev(`JSON.stringify({ loginOpen: document.getElementById('adminLoginModal').classList.contains('open') })`);
  console.log('   Login modal:', r);

  // Test 3: Login
  await ev(`document.getElementById('admUser').value='Tifin Holo12'; document.getElementById('admPass').value='sharma12@'; document.getElementById('admLoginBtn').click(); 'ok'`);
  await new Promise(r2 => setTimeout(r2, 5000));

  r = await ev(`JSON.stringify({ adminDisplay: document.getElementById('admin').style.display, orders: document.getElementById('admTotal').textContent, cards: document.querySelectorAll('#admList .ord').length })`);
  console.log('\n3. After login:', r);

  // Test 4: Order form
  await ev(`document.getElementById('admin').style.display='none'; document.getElementById('order').scrollIntoView(); 'ok'`);
  await new Promise(r2 => setTimeout(r2, 1000));
  await ev(`document.getElementById('n').value='Mobile Test'; document.getElementById('p').value='9876543210'; document.getElementById('a').value='Test'; document.getElementById('k').value=document.getElementById('k').options[1].value; document.getElementById('orderForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); 'submitted'`);
  await new Promise(r2 => setTimeout(r2, 5000));

  r = await ev(`JSON.stringify({ toast: document.getElementById('toast').textContent })`);
  console.log('\n4. Order form:', r);

  // Test 5: Admin shows new order
  await ev(`document.getElementById('adminKey').click(); 'ok'`);
  await new Promise(r2 => setTimeout(r2, 2000));
  await ev(`document.getElementById('admUser').value='Tifin Holo12'; document.getElementById('admPass').value='sharma12@'; document.getElementById('admLoginBtn').click(); 'ok'`);
  await new Promise(r2 => setTimeout(r2, 5000));

  r = await ev(`JSON.stringify({ totalOrders: document.getElementById('admTotal').textContent, orderCards: document.querySelectorAll('#admList .ord').length, hasAccept: document.querySelector('[data-act="confirmed"]') ? 'yes' : 'no' })`);
  console.log('\n5. Orders after submit:', r);

  // Test 6: Screenshot
  const shot = await send('Page.captureScreenshot', {});
  fs.writeFileSync('C:/Users/Rahul/tiffin-netlify/mobile-final.png', Buffer.from(shot.result.data, 'base64'));
  console.log('\n6. Screenshot saved: mobile-final.png');

  console.log('\n=== ERRORS ===');
  console.log('Console:', consoleMsgs.length ? consoleMsgs.join(' | ') : 'none');
  console.log('Exceptions:', exceptions.length ? exceptions.join(' | ') : 'none');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
