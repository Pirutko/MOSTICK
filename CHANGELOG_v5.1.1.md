## 5.1.2 — login, icons and theme hotfix

- Restored local Netlify DB state file for `netlify dev`.
- Added resilient logo fallback and cache-busting Service Worker.
- Replaced platform-colored emoji glyphs with monochrome translucent symbols.
- Removed hard-coded green sidebar override; sidebar now follows selected theme.

# MOSTIK 5.1.1 — оптимизация интерфейса

- Убраны из поставки старые копии проекта, `.netlify` state/database и `node_modules`: деплой стал существенно легче.
- Навигация больше не принудительно зелёная: цвет бокового меню строится из выбранной темы и режима.
- Кнопки, поля, карточки и статусы используют общие theme variables.
- Эмодзи-индикаторы унифицированы: монохромные, полупрозрачные, без пёстрой цветной палитры.
- GET-запросы API дедуплицируются и кратко кэшируются (1,5 с); после мутаций кэш очищается.
- Service Worker переведён на stale-while-revalidate для статических ресурсов: повторное открытие быстрее и при этом файлы обновляются в фоне.
- Удалён дубликат `mostik_logo.png`: используется `icons/icon-512.png`.
