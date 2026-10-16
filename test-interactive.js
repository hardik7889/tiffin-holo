// Full interactive test: click buttons, submit form, check admin flow
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

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
      consoleMsgs.push(`[${m.level}] ${m.text}`);
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

  await new Promise(r => ws.on('open', r));

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('=== Loading site ===');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 10000));

  // Test 1: Check all sections exist
  let r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      nav: !!document.querySelector('nav'),
      hero: !!document.getElementById('hero'),
      packages: !!document.getElementById('packages'),
      order: !!document.getElementById('order'),
      admin: !!document.getElementById('admin'),
      adminKey: !!document.getElementById('adminKey'),
      loginModal: !!document.getElementById('adminLoginModal'),
      mobileNav: !!document.querySelector('.mobile-nav'),
      installPrompt: !!document.getElementById('installPrompt'),
      orderForm: !!document.getElementById('orderForm'),
      dayCards: document.querySelectorAll('.day-card').length,
      pkgCards: document.querySelectorAll('.pkg-card, .combo-card').length,
      bodyVisible: document.body.offsetHeight > 0,
      bodyText: document.body.innerText.slice(0, 200)
    })`,
    returnByValue: true
  });
  console.log('\n1. PAGE STRUCTURE:');
  try { console.log(JSON.stringify(JSON.parse(r.result.result.value), null, 2)); } catch(e) { console.log(r.result.result.value); }

  // Test 2: Click adminKey (navbar) - should open login modal
  r = await send('Runtime.evaluate', {
    expression: `
      var btn = document.getElementById('adminKey');
      if (btn) {
        btn.click();
        'clicked adminKey';
      } else {
        'adminKey NOT FOUND';
      }
    `,
    returnByValue: true
  });
  console.log('\n2. CLICK adminKey:', r.result.result.value);
  await new Promise(r => setTimeout(r, 2000));

  // Check login modal
  r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      loginOpen: document.getElementById('adminLoginModal') ? document.getElementById('adminLoginModal').classList.contains('open') : false,
      loginDisplay: document.getElementById('adminLoginModal') ? getComputedStyle(document.getElementById('adminLoginModal')).display : 'N/A'
    })`,
    returnByValue: true
  });
  console.log('   Login modal:', r.result.result.value);

  // Test 3: Type credentials and login
  r = await send('Runtime.evaluate', {
    expression: `
      var u = document.getElementById('admUser');
      var p = document.getElementById('admPass');
      if (u && p) {
        u.value = 'Tifin Holo12';
        p.value = 'sharma12@';
        document.getElementById('admLoginBtn').click();
        'login submitted';
      } else {
        'login fields NOT FOUND';
      }
    `,
    returnByValue: true
  });
  console.log('\n3. LOGIN:', r.result.result.value);
  await new Promise(r => setTimeout(r, 5000));

  // Check admin section
  r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      adminDisplay: document.getElementById('admin') ? document.getElementById('admin').style.display : 'N/A',
      totalOrders: document.getElementById('admTotal') ? document.getElementById('admTotal').textContent : 'N/A',
      orderCards: document.querySelectorAll('#admList .ord').length,
      hasEmptyMsg: document.getElementById('admList') ? document.getElementById('admList').innerHTML.includes('koi order nahi') : false
    })`,
    returnByValue: true
  });
  console.log('   Admin section:', r.result.result.value);

  // Test 4: Check console errors
  console.log('\n4. CONSOLE MESSAGES:');
  console.log(consoleMsgs.length ? consoleMsgs.join('\n') : '  (none)');

  console.log('\n5. EXCEPTIONS:');
  console.log(exceptions.length ? exceptions.join('\n') : '  (none)');

  // Test 5: Check if order form works
  r = await send('Runtime.evaluate', {
    expression: `
      var form = document.getElementById('orderForm');
      if (!form) return 'orderForm NOT FOUND';
      var n = document.getElementById('n');
      var p = document.getElementById('p');
      var a = document.getElementById('a');
      var k = document.getElementById('k');
      if (n) n.value = 'Test User';
      if (p) p.value = '9876543210';
      if (a) a.value = 'Test Address';
      if (k) k.value = k.options[1] ? k.options[1].value : '';
      form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      'order form submitted';
    `,
    returnByValue: true
  });
  console.log('\n6. ORDER FORM:', r.result.result.value);
  await new Promise(r => setTimeout(r, 6000));

  // Check toast
  r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      toast: document.getElementById('toast') ? document.getElementById('toast').textContent : 'no toast',
      toastVisible: document.getElementById('toast') ? document.getElementById('toast').classList.contains('show') : false
    })`,
    returnByValue: true
  });
  console.log('   Toast:', r.result.result.value);

  // Final console errors
  console.log('\n7. FINAL CONSOLE MESSAGES:');
  console.log(consoleMsgs.length ? consoleMsgs.join('\n') : '  (none)');
  console.log('\n8. FINAL EXCEPTIONS:');
  console.log(exceptions.length ? exceptions.join('\n') : '  (none)');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
