/* 死活大师 · 过关斩将 · Service Worker
 * 装到主屏幕之后断网也能做：安装时全量预缓存，之后 cache-first。
 * 版本号由 build.py 写入，版本一变就换新缓存并清掉旧缓存。
 * 只在 https 或 localhost 下生效；局域网 http://192.168.x.x 不会注册，属预期。
 */
const V = "v1.0.20";
const PREFIX = "gshj-";
const CACHE = PREFIX + V;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./sounds.js",
  "./sfx.js",
  "./app.js",
  "./vendor/qrcode.js",
  "./vendor/jsqr.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  // 只缓存，不接管：装好后进入等待，页面弹「有新版本」，用户点了才发 SKIP_WAITING。
  // 用户点「稍后」也没关系，应用彻底关掉再打开时浏览器会自动换成新版本。
  // cache: "reload" 绕过浏览器 HTTP 缓存（GitHub Pages 默认缓存 10 分钟），
  // 免得刚发布时新版本号下缓存的还是旧文件。
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))))
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // version.txt / sw.js 不能被缓存，否则「检查更新」永远读到旧版本号
  if (/\/version\.txt$|\/sw\.js$/.test(url.pathname)) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 503, statusText: "Offline asset missing" });
      });
    })
  );
});
