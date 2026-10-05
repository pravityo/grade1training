const V = 'grade1math-v27';
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/render.js', 'js/trivia.js', 'js/adapt.js', 'js/knightwear.js', 'js/monsters.js', 'js/merge.js', 'js/family.js', 'js/firebase-config.js', 'js/cloud.js', 'js/bee.js', 'js/beeview.js', 'js/data/beewords.js', 'js/data/onebeewords.js', 'js/gate.js', 'js/data/deep-helpers.js', 'js/data/deep-math-a.js', 'js/data/deep-math-b.js', 'js/data/deep-eng-a.js', 'js/data/deep-eng-b.js', 'js/data/deep-sci-a.js', 'js/data/deep-sci-b.js', 'js/data/links.js', 'js/data/helpers.js', 'js/illustrations2.js', 'js/data/english1.js', 'js/data/english2.js', 'js/data/english3.js', 'js/data/english4.js', 'js/data/english5.js', 'js/data/english6.js', 'js/data/english7.js', 'js/data/english8.js', 'js/data/science1.js', 'js/data/science2.js', 'js/data/science3.js', 'js/data/science4.js', 'js/data/science5.js', 'js/data/science6.js', 'js/data/science7.js', 'js/data/science8.js', 'js/illustrations.js', 'js/data/pics.js', 'js/data/gens.js', 'js/gen.js', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png']
  .concat([1, 2, 3, 4, 5, 6, 7, 8].map(i => `js/data/week${i}.js`));
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  // the Firebase scripts are kept after the first visit, so the Grown-ups gate can open offline for a signed-in parent
  if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) { e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }))); return; }
  if (u.origin !== self.location.origin) return; // everything else from Google runs on its own
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(V).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
