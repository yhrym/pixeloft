---
title: Getting started
order: 1
description: Start Pixeloft with docker compose up, create the first admin on /setup and try the sample office.
---
To try the map editor, use the [browser map editor](../../editor/). It needs no sign-up. To use the office itself, run Pixeloft on your own PC or server. For a team, put it somewhere your members can reach.

Pixeloft runs as two containers: the app and PostgreSQL. You need Git, Docker with Compose and a browser.

## Start it

```sh
git clone https://github.com/yhrym/pixeloft.git
cd pixeloft
docker compose up -d
```

If you started it on your own PC, open <http://localhost:3000/setup>. If you started it on a server, open that server's URL followed by `/setup`. The app listens on port 3000 by default. Set `PORT` in a `.env` file to change the host port.

## First run: /setup

While there are no users, `/setup` asks for the first admin (login ID, display name, password) and for the first map:

- **Use the sample** (default): a fictional two-floor office. The language follows your browser.
- **Upload a JSON file**: a map exported from the [map editor](../map-editor/).
- **Start with an empty office**: you build the floor plan in `/editor` after logging in.

After that, `/setup` redirects to the login page.

## Log in and pick a seat

Log in as the admin you created and the office opens. Press "Enter", then choose a free seat or press "Seat me anywhere", and your character sits down and becomes visible to your teammates.

If you chose "Start with an empty office", open **Editor** in the menu after logging in, place rooms, an entrance and desks, and press **Publish**. Then go back to the office and enter.

## Invite members

Create invite links under **Manage members** in the menu. There is no email and no external login service: members join through an invite link and reset passwords through a reset link an admin creates.

## Settings you can change

Every environment variable is optional. Put them in a `.env` file next to `docker-compose.yml` or in the shell.

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | empty | Public URL such as `https://office.example.com`. Used for invite and reset links and for the Web Push contact. |
| `TZ` | `Asia/Tokyo` | Initial time zone (IANA name). The date rollover, auto leave and the light follow it. |
| `PORT` | `3000` | Host port that maps to the app. |
| `TRUSTED_PROXY` | empty | Set `1` when the app runs behind a reverse proxy you control. See [Operations](../operations/). |

Everything else is in the admin settings page (`/admin/settings`). See [Settings](../settings/).

## What you get

- Presence: enter, leave, away, auto-away after 15 minutes without interacting with the office tab, daily reset. You leave automatically when the work end hour has passed and you have been idle.
- Statuses: working, focus (25 min), break, in a meeting. Some rooms set a status automatically.
- Chat per room: only the room you are in, only for that day, 200 characters, mentions, reactions, undo within 60 seconds.
- "Got a minute?" calls and waves show up in the office. "Got a minute?" also reaches you as Web Push with the tab closed, once you turn on notifications and allow them in the browser (needs HTTPS or `localhost`, see [Calls and notifications](../calls/)).
- Time-of-day lighting, optional weather, seasonal decorations.
- Japanese and English.

## Next

- Design your own floor plan in the [map editor](../map-editor/). You can do it in the browser before you run anything.
- Serve the app over HTTPS: [Calls and notifications](../calls/).
- Back it up and keep it updated: [Operations](../operations/).
