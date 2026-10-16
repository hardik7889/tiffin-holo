// Load the live site in headless Chrome and capture console errors + page state
const { spawn, execSync } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
  // Wait for chrome to be ready
  let pages = null;
  for (let i = 0; i < 20; i++) {
    try { pages = await httpGet('/json/list'); if (pages.length) break; } catch(e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!pages || !pages.length) { console.log('ERR: no chrome pages'); process.exit(1); }

  // Find an existing page to connect to, or use the first page
  let tab;
  try {
    const allPages = await httpGet('/json/list');
    tab = allPages.find(p => p.url === 'about:blank') || allPages[0];
  } catch(e) {
    console.log('ERR getting pages:', e.message);
    process.exit(1);
  }
  if (!tab) { console.log('ERR: no usable page'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let id = 0;
  const pending = {};
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Console.messageAdded') {
      const m = msg.params.message;
      if (m.level === 'error') consoleErrors.push(m.text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Network.loadingFailed') {
      networkErrors.push(msg.params.errorText + ' | ' + (msg.params.request ? msg.params.request.url : ''));
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

  console.log('Navigating to:', URL);
  await send('Page.navigate', { url: URL });

  // Wait for page load
  await new Promise(r => setTimeout(r, 12000));

  // Evaluate page state
  const result = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      url: location.href,
      bodyLen: document.body ? document.body.innerHTML.length : 0,
      hasNav: !!document.querySelector('nav'),
      hero: !!document.getElementById('hero'),
      packages: !!document.getElementById('packages'),
      order: !!document.getElementById('order'),
      admin: !!document.getElementById('admin'),
      adminKey: !!document.getElementById('adminKey'),
      loginModal: !!document.getElementById('adminLoginModal'),
      brokenImgs: Array.from(document.querySelectorAll('img')).filter(i => i.complete && i.naturalWidth === 0).length,
      totalImgs: document.querySelectorAll('img').length,
      scriptErrors: window.__errors || [],
      bodyText: document.body ? document.body.innerText.slice(0, 300) : 'NO BODY'
    })`,
    returnByValue: true
  });

  console.log('\n=== PAGE STATE ===');
  try {
    const state = JSON.parse(result.result.result.value);
    console.log(JSON.stringify(state, null, 2));
  } catch(e) {
    console.log('raw:', result.result.result.value);
  }

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : 'none');

  console.log('\n=== PAGE EXCEPTIONS ===');
  console.log(pageErrors.length ? pageErrors.join('\n') : 'none');

  console.log('\n=== NETWORK FAILURES ===');
  console.log(networkErrors.length ? networkErrors.slice(0,10).join('\n') : 'none');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
