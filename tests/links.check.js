/* Run: node tests/links.check.js [--prune]
   Requests every outside link in js/data/links.js. Links that answer 404 or 410 are dead (the run fails and --prune removes them); other non-200 answers are listed as unverified and do not fail the run.
   Needs internet, so it is NOT part of the offline test set. Uses curl so proxy settings are respected.
   --prune removes every dead link (refused if half or more are dead, which means something is wrong with the network, not the links) from js/data/links.js (a lesson keeps its other links).
   Writes tests/links.report.json. A page that answers 200 can still be off-topic, so also read the report titles. */
globalThis.window = globalThis; const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const file = path.join(__dirname, '..', 'js', 'data', 'links.js');
eval(fs.readFileSync(file, 'utf8'));
const UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const urls = [...new Set(Object.values(window.LINKS).flat().map(l => l[1]))];
const probe = url => new Promise(res => execFile('curl', ['-sS', '-L', '--max-time', '25', '--max-redirs', '6', '-A', UA, '-o', '/dev/null', '-w', '%{http_code} %{url_effective}', url], (err, out) => {
  const m = /^(\d{3}) (.*)$/.exec((out || '').trim());
  res({ url, status: m ? +m[1] : 0, final: m ? m[2] : '', error: err ? String(err.message).split('\n')[0].slice(0, 120) : '' });
}));
(async () => {
  const results = []; let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < urls.length) { const u = urls[i++]; let r = await probe(u); if (r.status !== 200) r = await probe(u); results.push(r); } }));
  const bad = results.filter(r => r.status !== 200).sort((a, b) => a.url.localeCompare(b.url));
  // 404 and 410 mean the page is gone. 401, 403, 429, timeouts and connection errors usually mean the site blocks automated checks (GitHub's servers get this a lot), so they are reported but do not fail the run.
  const gone = bad.filter(r => r.status === 404 || r.status === 410), blocked = bad.filter(r => !gone.includes(r));
  if (results.length && results.every(r => r.status === 0)) { console.log('No request got any HTTP answer: this machine has no internet access (or blocks the proxy). Nothing was written or pruned.'); process.exit(2); }
  fs.writeFileSync(path.join(__dirname, 'links.report.json'), JSON.stringify({ checked: results.length, ok: results.length - bad.length, failing: bad }, null, 1));
  console.log(`checked ${results.length}, ok ${results.length - bad.length}, gone (404/410) ${gone.length}, could not verify ${blocked.length}`);
  gone.forEach(r => console.log('GONE', r.status, r.url));
  blocked.forEach(r => console.log('unverified', r.status || 'ERR', r.url));
  if (process.argv.includes('--prune') && gone.length && gone.length < results.length * 0.5) {
    const dead = new Set(gone.map(r => r.url));
    let src = fs.readFileSync(file, 'utf8');
    const kept = {};
    Object.entries(window.LINKS).forEach(([id, list]) => { const k = list.filter(l => !dead.has(l[1])); if (k.length) kept[id] = k; });
    const head = src.split('\n').slice(0, 2).join('\n');
    const body = Object.entries(kept).map(([id, list]) => `  '${id}': ${JSON.stringify(list)}`).join(',\n');
    fs.writeFileSync(file, `${head}\nObject.assign(window.LINKS, {\n${body}\n});\n`);
    console.log('pruned', gone.length, 'links');
  }
  process.exit(gone.length ? 1 : 0);
})();
