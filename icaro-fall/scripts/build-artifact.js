// Gera uma página única e autocontida (dist-artifact/icaro-fall.html) com o jogo em modo offline:
// a sala e os bots rodam no navegador. Uso: node scripts/build-artifact.js
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

process.env.VITE_OFFLINE = '1';
const out = path.resolve('dist-artifact');
const res = await build({
  root: 'client', logLevel: 'warn',
  build: { outDir: path.join(out, 'tmp'), emptyOutDir: true, write: false, cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
const output = (Array.isArray(res) ? res[0] : res).output;
const js = output.find((o) => o.type === 'chunk').code.replace(/<\/script/gi, '<\\/script');
const css = output.find((o) => o.fileName.endsWith('.css')).source.toString();
const html = fs.readFileSync('client/index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const page = `<title>Ícaro Fall</title>
<meta name="theme-color" content="#2FA8F5">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Nunito:wght@600;800&display=swap" rel="stylesheet">
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icaro-fall.html'), page);
console.log('dist-artifact/icaro-fall.html', (page.length / 1024).toFixed(0) + ' KB');
