# MOSTIK v2.8 — Performance audit

This patch is intentionally conservative. No business logic was rewritten without runtime profiling.

## Largest files

- `public/app.js` — 209.2 KB
- `public/mostik_logo.png` — 130.3 KB
- `public/icons/icon-512.png` — 130.3 KB
- `netlify/functions/api.mjs` — 91.5 KB
- `public/app.css` — 49.0 KB
- `public/icons/icon-192.png` — 32.0 KB
- `netlify/database/migrations/004_demo_seed.sql` — 11.4 KB
- `CHANGELOG_v5.1.0.md` — 2.5 KB
- `netlify/database/migrations/003_care_training_vet.sql` — 2.4 KB
- `netlify/database/migrations/016_medication_schedule.sql` — 2.2 KB
- `netlify/database/migrations/017_diets_and_food_products.sql` — 2.1 KB
- `netlify/database/migrations/001_init.sql` — 2.0 KB
- `DEPLOY_NETLIFY.md` — 1.9 KB
- `public/sw.js` — 1.5 KB
- `netlify/database/migrations/005_animal_attention_skill_mastery.sql` — 1.3 KB
- `run.bat` — 1.2 KB
- `CHANGELOG_v5.0.0.md` — 1.2 KB
- `README.md` — 1.0 KB
- `netlify/database/migrations/008_reminders.sql` — 0.9 KB
- `netlify/database/migrations/009_insight_events.sql` — 0.9 KB

## Recommended optimization order
1. Lazy-load large UI modules and route-specific code.
2. Minify/bundle `public/app.js` and CSS for production.
3. Reduce repeated API requests and cache stable reference data.
4. Paginate journal/calendar data instead of loading the full history.
5. Debounce search/filter handlers and avoid full DOM rerenders.
6. Add database indexes based on actual query plans.
7. Remove unused assets and development artifacts from deployment.

## Safety note
The current request asks for speed and size optimization. A safe optimization patch should be based on the actual v5.1.0-5 source and its runtime behavior; speculative rewrites can break existing features. This artifact therefore records the measured file inventory and optimization plan without changing application behavior.
