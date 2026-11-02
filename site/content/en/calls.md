---
title: Calls and notifications
order: 5
description: Got a minute calls, waves and Web Push. Why Web Push needs HTTPS, with a Caddy example.
---
## What is delivered

- **Got a minute?** A call to a teammate. They can answer "On my way" or "Later".
- **Waves**: a light hello that can be waved back.

Both show up in the office for people who have it open. People who allow notifications also get them as Web Push when the tab is in the background.

## Web Push needs HTTPS

Web Push and the service worker only work on HTTPS, or on `localhost`. If you open the app over plain HTTP on another host, the browser will not offer notifications. Put a reverse proxy in front of the app.

### A Caddy example

Caddy gets a certificate automatically:

```
office.example.com {
	reverse_proxy localhost:3000
}
```

Then set these in `.env` and run `docker compose up -d` again:

```
APP_URL=https://office.example.com
TRUSTED_PROXY=1
```

`APP_URL` is used for invite and reset links and for the Web Push contact. `TRUSTED_PROXY` is explained in [Operations](../operations/). Only set it when every request really passes through your proxy.

## Call URLs

The video or voice call itself happens elsewhere. Set a call URL per room in [Settings](../settings/), and the room offers a button that opens it.
