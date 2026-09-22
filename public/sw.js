/*
 * sw.js — what makes this work with no signal.
 *
 * The app shell is cached on install; everything else (including the ~6MB OCR
 * reader, which is worth never downloading twice) is cached the first time it
 * is fetched. Network-first for navigations so a new deploy is picked up,
 * cache-first for assets so a kitchen with no bars still opens the app.
 */
const VERSION = 'pantry-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return

  if (req.mode === 'navigate') {
    // A new build should win when there is a network; the cache is the
    // fallback, not the default.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(VERSION).then((c) => c.put(req, copy))
      }
      return res
    })),
  )
})
