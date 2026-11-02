---
title: Getting started
order: 1
description: Start Pixeloft with docker compose up, create the first admin on /setup and try the sample office.
---
Pixeloft runs as two containers: the app and PostgreSQL. You need Docker with Compose and a browser.

## Start it

```sh
git clone https://github.com/yhrym/pixeloft.git
cd pixeloft
docker compose up -d
```

Open <http://localhost:3000/setup>. The app listens on port 3000 by default. Set `PORT` in a `.env` file to change the host port.

## First run: /setup

While there are no users, `/setup` asks for the first admin (login ID, display name, password) and for the first map:

- **Use the sample** (default): a fictional two-floor office. The language follows your browser.
- **Upload a JSON file**: a map exported from the [map editor](../map-editor/).
- **Start empty**: you build the floor plan in `/editor` after logging in.

After that, `/setup` redirects to the login page. Create invite links under Members in the menu. There is no email and no external login service: members join through an invite link and reset passwords through a reset link an admin creates.

## Environment variables

Every variable is optional. Put them in a `.env` file next to `docker-compose.yml` or in the shell.

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | empty | Public URL such as `https://office.example.com`. Used for invite and reset links and for the Web Push contact. |
| `TZ` | `Asia/Tokyo` | Initial time zone (IANA name). The date rollover, auto leave and the light follow it. |
| `PORT` | `3000` | Host port that maps to the app. |
| `TRUSTED_PROXY` | empty | Set `1` when the app runs behind a reverse proxy you control. See [Operations](../operations/). |

Everything else is in the admin settings page (`/admin/settings`). See [Settings](../settings/).

## What you get

- Presence: enter, leave, away, auto-away after 15 minutes, daily reset, automatic leave after work hours.
- Statuses: working, focus (25 min), break, in a meeting. Some rooms set a status automatically.
- Chat per room: only the room you are in, only for that day, 200 characters, mentions, reactions, undo within 60 seconds.
- "Got a minute?" calls and waves, delivered with Web Push (needs HTTPS, see [Calls and notifications](../calls/)).
- Time-of-day lighting, optional weather, seasonal decorations.
- Japanese and English.

## Next

- Design your own floor plan in the [map editor](../map-editor/). You can do it in the browser before you run anything.
- Put the app behind HTTPS: [Calls and notifications](../calls/).
- Back it up and keep it updated: [Operations](../operations/).
