// Minimal service worker. Voyager is a live tool (it needs the backend over
// WebSocket + REST), so there is nothing useful to cache offline. This SW
// exists only to satisfy Chrome's installability criteria so the app can be
// installed as a standalone/pinned window. It passes every request straight
// through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
