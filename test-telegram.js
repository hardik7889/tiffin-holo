// Verify the Telegram notify path with the real bot token.
const fs = require('fs');
const env = fs.readFileSync('C:/Users/Rahul/AppData/Local/hermes/.env', 'utf8');
const tok = (env.match(/^\s*TELEGRAM_BOT_TOKEN=(\S+)/m) || [])[1];
const chat = (env.match(/^\s*TELEGRAM_HOME_CHANNEL=(\S+)/m) || [])[1];

(async () => {
  if (!tok) { console.log('no token found'); process.exit(1); }
  console.log('token present:', true, '| chat:', chat);

  const me = await (await fetch(`https://api.telegram.org/bot${tok}/getMe`)).json();
  console.log('getMe ok:', me.ok, me.ok ? '(@' + me.result.username + ')' : JSON.stringify(me).slice(0, 120));

  const text = '🍱 TEST — Tiffin Holo order alert\n\nOrder ID: TH-TEST-0001\nNaam: Test Customer\nPhone: 9876543210\nPackage: Full Day Combo — Monthly (₹4,999)\n\n(Automated test from your site setup — ignore)';
  const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  const j = await r.json();
  console.log('sendMessage ok:', j.ok, j.ok ? 'message_id=' + j.result.message_id : JSON.stringify(j).slice(0, 200));
  process.exit(j.ok ? 0 : 1);
})();
