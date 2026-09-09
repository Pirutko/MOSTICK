# MOSTIK — Netlify deployment

## GitHub + Netlify

1. Распакуйте архив в отдельную папку.
2. Создайте/откройте репозиторий GitHub для MOSTIK.
3. Загрузите **содержимое** этой папки в корень репозитория (файл `netlify.toml` должен лежать в корне).
4. В Netlify подключите этот репозиторий к сайту и ветке `main`.
5. Параметры сборки уже заданы в `netlify.toml`:
   - publish: `public`
   - build command: `npm run build`
   - functions: `netlify/functions`
6. После деплоя Netlify Functions доступны через `/api/...` благодаря redirect из `netlify.toml`.

## База данных

В проекте есть миграции `netlify/database/migrations/001...010`. Для первого локального запуска используйте `run.bat`: он запускает Netlify Dev и затем применяет миграции локальной базы.

Для production-базы используйте Netlify Database и примените миграции в окружении Netlify. Не удаляйте и не переименовывайте существующие миграции после того, как они были применены.

## Важно

Не коммитьте реальные секреты, пароли, токены или локальные файлы `.netlify/`.

## Пароль: восстановление и показ
Для отправки ссылок восстановления в Netlify откройте Project configuration → Environment variables и добавьте `RESEND_API_KEY` и `RESEND_FROM_EMAIL`. После сохранения выполните новый deploy.


## MOSTIK 5.0.0
No new database migration is required for the unified workspace/journal changes.
