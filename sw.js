// 工作台 Service Worker：页面骨架缓存（秒开 + 离线可用）
// 数据层（localStorage + 云同步）不经手：跨源请求与非 GET 全部直放
const CACHE = 'wb-shell-v1';
const CORE = ['./', './index.html', './admin.html', './manifest.json', './icon.png', './icon-192.png', './icon-512.png', './apple-icon.png', './favicon.ico'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // 只管同源 GET；云同步（跨源 wbsync）和 POST 请求一律直放，不缓存不拦截
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // 网络优先：在线每次打开=CDN 最新版；离线/失败退回缓存（秒开兜底）
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', cp));
        return res;
      }).catch(() => caches.match('./index.html').then(hit => hit || Response.error()))
    );
    return;
  }

  // 静态资源：缓存优先，未命中走网络并回填
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
      return res;
    }).catch(() => hit))
  );
});
