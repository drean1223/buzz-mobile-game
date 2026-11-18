// Builds a single self-contained page body (no <html>/<head>/<body> wrapper) for hosting
// as a claude.ai Artifact: node tools/artifact.cjs <out.html>
const { execSync } = require('child_process');
const fs = require('fs');
execSync('npx vite build --mode single', {
  stdio: 'inherit',
  env: { ...process.env, VITE_PUBLIC_URL: 'https://drean1223.github.io/buzz-mobile-game/' },
});
const html = fs.readFileSync('dist-single/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const keep = [];
const title = head.match(/<title>[\s\S]*?<\/title>/);
if (title) keep.push(title[0]);
for (const m of head.matchAll(/<meta name="description"[^>]*>/g)) keep.push(m[0]);
for (const m of head.matchAll(/<link[^>]*(fonts\.googleapis|fonts\.gstatic)[^>]*>/g)) keep.push(m[0]);
for (const m of head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)) keep.push(m[0]);
const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const out = keep.join('\n') + '\n' + body.trim() + '\n' + scripts.join('\n') + '\n';
fs.writeFileSync(process.argv[2], out);
console.log('wrote', process.argv[2], (out.length / 1024).toFixed(1) + 'KB');
