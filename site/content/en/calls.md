---
title: Calls and notifications
order: 5
description: Got a minute calls, waves and Web Push. Why Web Push needs HTTPS, with a Caddy example.
---
## What is delivered

- **Got a minute?** A call to a teammate. They can choose **Go** or **Later** to reply.
- **Waves**: a quick greeting. The recipient can wave back.

Both appear in the office for people who have it open. To receive "Got a minute?" requests as Web Push notifications even with the tab closed, turn on **Notify me when called** in the office and allow notifications in your browser. This requires HTTPS or `localhost`.

## Web Push and HTTPS

Web Push and the service worker only work on HTTPS, or on `localhost`. If you open the app over plain HTTP on another host, the browser will not offer notifications. Put a reverse proxy in front of the app.

### A Caddy example

Caddy gets a certificate automatically:

```
office.example.com {
	reverse_proxy localhost:3000
}
```

First make sure nobody can reach the app's port directly: publish it only on `127.0.0.1` or restrict it with a firewall. See [Operations](../operations/) for details. Then set these in `.env` and run `docker compose up -d` again:

```
APP_URL=https://office.example.com
TRUSTED_PROXY=1
```

`APP_URL` is used for invite and reset links and for the Web Push contact. `TRUSTED_PROXY` is explained in [Operations](../operations/). Only set it when every request really passes through your proxy.

## Call URLs

The video or voice call itself happens elsewhere. Set a call URL per room in [Settings](../settings/), and the room offers a button that opens it.
