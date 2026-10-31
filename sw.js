/* ============================================================
   个人博客 · Service Worker
   ------------------------------------------------------------
   为什么需要它：
   - 手机 / 平板把站点"添加到主屏幕"后想以独立窗口打开（不是浏览器标签页），
     除了 manifest 里的 display: standalone，Chromium 系浏览器还要求站点有
     Service Worker，否则只会生成一个普通书签快捷方式。
   - 顺带的好处：打开过的页面离线也能看。

   策略：**网络优先**（在线永远拿最新的，不会出现"改了文章看不到"），
   断网时才回落到缓存；缓存条目数有上限，activate 时清掉旧版本。
   ============================================================ */
'use strict';

const CACHE = 'blog-v1';
const MAX_ENTRIES = 60;

/** 装 SW 时先存一份"外壳"：这样第一次访问之后断网，首页也还能打开 */
const PRECACHE = ['./index.html', './assets/style.css', './assets/app.js', './site.webmanifest'];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>离线 · 时光不语</title>
<style>
  html { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: #faf9f7; color: #24292f; text-align: center; padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #15181d; color: #e6e6e6; }
  }
  p { margin: 8px 0; line-height: 1.7; }
  .hint { opacity: .6; font-size: 14px; }
  a { color: #b4453a; }
  @media (prefers-color-scheme: dark) { a { color: #e8836f; } }
</style>
</head>
<body>
  <div>
    <p>现在没有网络，这一页也没存过。</p>
    <p class="hint">联网后刷新即可；看过的页面在离线时仍能打开。</p>
    <p><a href="./">回到首页</a></p>
  </div>
</body>
</html>
`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // 单个文件失败不影响安装（比如某天 index.html 还没生成）
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new URL(url, self.registration.scope).href).catch(() => {}),
        ),
      );
      // 新版本立刻生效，不用等所有旧页面关掉
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

/** 缓存超过上限时删掉最早放进去的，避免越攒越大 */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(key);
}

async function respond(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      const cache = await caches.open(CACHE);
      const copy = fresh.clone();
      cache.put(request, copy).then(() => trim(cache)).catch(() => {});
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      // 首页（/ 结尾）用装 SW 时存下的外壳顶上；其它没存过的页面给一个能看懂的离线页
      const url = new URL(request.url);
      const isHome = url.pathname === new URL('./', self.registration.scope).pathname;
      if (isHome) {
        const home = await caches.match(new URL('./index.html', self.registration.scope).href, {
          ignoreSearch: true,
        });
        if (home) return home;
      }
      return new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
