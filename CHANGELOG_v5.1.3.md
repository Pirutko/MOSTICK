# MOSTIK 5.1.3 — official logo

- Replaced `icons/icon-192.png` / `icons/icon-512.png` with the official MOSTIK badge (bridge + paw mark), exported with a transparent background so it sits cleanly on the login card and the sidebar without a background box.
- Added dedicated `icon-maskable-192.png` / `icon-maskable-512.png` with extra safe-zone padding for Android/PWA home-screen icons, split from the full-bleed `any` icons used inside the app; `manifest.webmanifest` updated accordingly.
- Fixed the logo's dark-mode handling: the invert filter now also applies in the default "auto" appearance mode (previously it only triggered for the explicit "dark" mode, so the navy badge had low contrast against the dark sidebar/login card by default). Light mode keeps the logo in its natural navy-on-cream colors. Per-theme hue-rotate filters continue to be suppressed for the logo so brand colors stay accurate across all themes.
- Slightly enlarged the login-screen logo (84px → 96px) for better presence.
- Bumped the Service Worker cache version so installed/PWA users pick up the new artwork immediately instead of a stale cached icon.

No database migration required.
