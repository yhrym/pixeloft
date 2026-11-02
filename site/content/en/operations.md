---
title: Operations
order: 6
description: Backup and restore, upgrading, running a single app process, TRUSTED_PROXY and the login rate limit.
---
## Backup and restore

Everything is in the PostgreSQL volume `pgdata`.

```sh
# backup
docker compose exec -T db pg_dump -U vo -Fc vo > pixeloft.dump

# restore (into a running, empty or existing database)
docker compose stop app
docker compose exec -T db pg_restore -U vo -d vo --clean --if-exists < pixeloft.dump
docker compose start app
```

## Upgrading

```sh
git pull
docker compose up -d --build
```

Database migrations run automatically when the app container starts.

## Run a single app process

Keep exactly one `app` container. The 1-second state cache, emotes, heartbeat throttling and the login rate limit live in the process memory, so two processes would disagree with each other. One process handles a company-sized office fine.

## TRUSTED_PROXY and the login rate limit

The login rate limit allows 10 failures per 15 minutes.

- **Without `TRUSTED_PROXY`**, the app cannot tell clients apart, so failures are counted per login ID only. Anyone who knows an ID can type wrong passwords and lock that account out for 15 minutes.
- **With `TRUSTED_PROXY=1`**, the app takes the client address from `X-Forwarded-For` (the last entry, which your proxy adds) and counts failures per ID and address, so an attacker only locks themselves out. The origin check on writes then uses `X-Forwarded-Host` and `X-Forwarded-Proto`.

Only set it when every request really passes through your proxy. The app trusts those headers from whoever can reach port 3000, so block direct access to that port with a firewall, or bind it to `127.0.0.1` with a compose override. See [Calls and notifications](../calls/) for a Caddy example.

## Development

```sh
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
npm install
npx prisma migrate deploy
npm run dev
```

`docker-compose.dev.yml` publishes the database on `127.0.0.1:${DB_PORT:-5432}`. If 5432 is taken, start with `DB_PORT=55432` and change the port in `DATABASE_URL` in `.env` to match.
