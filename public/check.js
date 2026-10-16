const fs = require('fs');
const t = fs.readFileSync('index.html', 'utf-8');
const scripts = [...t.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
let ok = 0, fail = 0;
for (const m of scripts) {
  const s = m[1];
  if (s.trim().length < 20) continue;
  try { new Function(s); ok++; }
  catch(e) { fail++; console.log('SCRIPT ERROR:', e.message.slice(0, 200)); }
}
console.log('scripts OK:', ok, '| fail:', fail);
console.log('has DOCTYPE:', t.startsWith('<!DOCTYPE'));
console.log('has </html>:', t.includes('</html>'));
console.log('script tags:', (t.match(/<script/g) || []).length);
console.log('closing script tags:', (t.match(/<\/script>/g) || []).length);
console.log('netlify-hud occurrences:', (t.match(/netlify-hud/g) || []).length);
console.log('MutationObserver:', t.includes('MutationObserver'));
// Check where the badge code is
const badgeIdx = t.indexOf('MutationObserver');
const lastScriptClose = t.lastIndexOf('</script>');
console.log('badge JS before last </script>:', badgeIdx < lastScriptClose);
// Check for unclosed braces in badge area
const badgeArea = t.substring(badgeIdx - 200, badgeIdx + 500);
console.log('badge area braces:', (badgeArea.match(/{/g) || []).length, 'open,', (badgeArea.match(/}/g) || []).length, 'close');
