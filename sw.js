/* 麻辣香锅鸡 Service Worker：离线缓存应用外壳（所有资源内联在 index.html）
   缓存策略改为 network-first：每次打开都优先取最新版，网络失败才回退缓存
   解决"部署新版后浏览器一直返回旧版缓存"的问题 */
const CACHE_NAME = 'mxl-gj-shell-v80';
const APP_SHELL = ['./manifest.json', './icon.svg', './icon.png', './icon-192.png', './icon-maskable.png']; /* 不再预缓存 3.5MB 的 index.html */

self.addEventListener('install', (e) => {
    /* 预缓存失败时：不激活残缺的 SW（否则离线时缺资源），交给下轮安装重试 */
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then((c) => c.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); return null; })))
            .then(() => self.clients.claim())
    );
});

/* 策略：导航请求（页面）缓存优先——有缓存秒开，同时后台拉最新版；无缓存才等网络 */
self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    if (req.mode === 'navigate') {
        /* v6.3.21：页面一律走网络，不再每次打开都把 3.5MB HTML 重写进缓存。
           只在“这个版本还没有离线副本”时补存一次，避免每次启动都产生一次大写入。 */
        e.respondWith(
            fetch(req, { cache: 'no-store' }).then((res) => {
                if (res && res.status === 200) {
                    caches.match('./index.html').then((hit) => {
                        if (!hit) {
                            const clone = res.clone();
                            caches.open(CACHE_NAME).then((c) => c.put('./index.html', clone)).catch(() => {});
                        }
                    });
                }
                return res;
            }).catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
        );
        return;
    }
    /* 其他静态资源（manifest/icon 等）：缓存优先，同时后台更新（stale-while-revalidate） */
    e.respondWith(
        caches.match(req).then((hit) => {
            const network = fetch(req).then((res) => {
                if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, clone));
                }
                return res;
            }).catch(() => hit);
            return hit || network;
        })
    );
});
