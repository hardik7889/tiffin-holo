// Mobile screenshot + full test
const { spawn } = require('child_process');
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

  let tab = pages.find(p => p.type === 'page' && p.url === 'about:blank') || pages.find(p => p.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let id = 0;
  const pending = {};
  const exceptions = [];
  const netFails = [];

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionThrown;
      exceptions.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Network.loadingFailed') {
      netFails.push(msg.params.errorText + ' ' + (msg.params.request ? msg.params.request.url.slice(-50) : ''));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });

  console.log('Loading mobile viewport...');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 15000));

  // Check state
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      vw: window.innerWidth,
      docH: document.documentElement.scrollHeight,
      nav: !!document.querySelector('nav'),
      navLinks: document.querySelectorAll('nav a').length,
      hero: !!document.getElementById('hero'),
      packages: !!document.getElementById('packages'),
      order: !!document.getElementById('order'),
      adminKey: !!document.getElementById('adminKey'),
      mobileNav: !!document.querySelector('.mobile-nav'),
      mobileNavVisible: document.querySelector('.mobile-nav') ? getComputedStyle(document.querySelector('.mobile-nav')).display : 'N/A',
      installPrompt: !!document.getElementById('installPrompt'),
      orderForm: !!document.getElementById('orderForm'),
      dayCards: document.querySelectorAll('.day-card').length,
      loadedImgs: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth > 0).length,
      totalImgs: document.querySelectorAll('img').length,
      text: document.body.innerText.slice(0, 200)
    })`,
    returnByValue: true
  });
  console.log('\n=== MOBILE STATE ===');
  try { console.log(JSON.stringify(JSON.parse(r.result.result.value), null, 2)); } catch(e) { console.log(r.result.result.value); }

  // Screenshot
  const shot = await send('Page.captureScreenshot', {});
  fs.writeFileSync('C:/Users/Rahul/tiffin-netlify/mobile-test.png', Buffer.from(shot.result.data, 'base64'));
  console.log('\nScreenshot saved: mobile-test.png');

  // Scroll down and screenshot again
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 1500)' });
  await new Promise(r2 => setTimeout(r2, 2000));
  const shot2 = await send('Page.captureScreenshot', {});
  fs.writeFileSync('C:/Users/Rahul/tiffin-netlify/mobile-test-2.png', Buffer.from(shot2.result.data, 'base64'));
  console.log('Screenshot 2 saved: mobile-test-2.png');

  console.log('\n=== EXCEPTIONS ===');
  console.log(exceptions.length ? exceptions.join('\n') : 'none');
  console.log('=== NETWORK FAILURES ===');
  console.log(netFails.length ? netFails.join('\n') : 'none');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
