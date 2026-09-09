# MOSTIK 5.1.4 — logo not rendering (inline embed fix)

Symptom: after 5.1.3 the logo still didn't appear on the login screen or in the
sidebar — the `<img>` alt text ("MOSTIK") showed instead of the picture.

Root cause: the app requests `/icons/icon-512.png` / `/icons/icon-192.png` as
separate static files, but `netlify.toml` has a catch-all SPA redirect
(`/* -> /index.html`). If those files aren't actually present at the served
`public/icons/` path (stale deploy, wrong publish dir, local dev server not
picking up the new files, etc.), the request falls through to that redirect
and gets back the HTML page instead of an image — the browser then shows the
`alt` text instead of a broken-image icon, which is exactly what the
screenshots showed.

Fix: the logo is no longer loaded as a separate file at all. It's now a
base64 data URI baked directly into `app.js` (`LOGO_SRC` constant, used by
both the login-screen logo and the sidebar logo) and into `index.html`'s
favicon `<link>`. Since it ships inside files that were already loading
successfully, it can't 404 or get swallowed by the redirect — it renders
unconditionally, independent of how `/icons/*` is served.

`public/icons/icon-192.png` / `icon-512.png` / `icon-maskable-*.png` are
still shipped as real files too, for the PWA manifest (`manifest.webmanifest`)
— home-screen/install icons need real file URLs, not data URIs, in most
browsers. If those still don't show up on your deployment, check that
`netlify.toml`'s `publish = "public"` actually points at the folder you
deployed and that `public/icons/` contains the new files (not the old ones) —
that's the same redirect issue described above.

Bumped Service Worker cache version again so this ships immediately to
already-installed/PWA clients.

No database migration required.
