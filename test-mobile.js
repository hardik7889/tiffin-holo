// Mobile viewport test (360x800 - typical Android phone)
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
  const networkFails = [];

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Console.messageAdded') {
      const m = msg.params.message;
      consoleMsgs.push(`[${m.level}] ${m.text.slice(0, 150)}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionThrown;
      exceptions.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Network.loadingFailed') {
      networkFails.push(msg.params.errorText + ' ' + (msg.params.request ? msg.params.request.url.slice(-60) : ''));
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
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360, height: 800, deviceScaleFactor: 2, mobile: true
  });
  await send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  });

  console.log('Loading site in mobile viewport (360x800)...');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 12000));

  // Check page state
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      docHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      hasNav: !!document.querySelector('nav'),
      navLinks: document.querySelectorAll('nav a').length,
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
      brokenImgs: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length,
      totalImgs: document.querySelectorAll('img').length,
      text: document.body.innerText.slice(0, 250),
      firstImgs: Array.from(document.querySelectorAll('img')).slice(0, 3).map(i => ({src: i.src.slice(-40), loaded: i.complete && i.naturalWidth > 0}))
    })`,
    returnByValue: true
  });
  console.log('\n=== MOBILE PAGE STATE ===');
  try { console.log(JSON.stringify(JSON.parse(r.result.result.value), null, 2)); } catch(e) { console.log(r.result.result.value); }

  console.log('\n=== CONSOLE MESSAGES ===');
  console.log(consoleMsgs.length ? consoleMsgs.join('\n') : '  (none)');

  console.log('\n=== EXCEPTIONS ===');
  console.log(exceptions.length ? exceptions.join('\n') : '  (none)');

  console.log('\n=== NETWORK FAILURES ===');
  console.log(networkFails.length ? networkFails.join('\n') : '  (none)');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
