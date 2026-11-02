---
title: FAQ
order: 7
description: Short answers about walking, privacy, WebSocket, accounts, licensing and contributions.
---
## Why do characters not walk around?

You pick a seat and stay there. Characters only walk when someone moves to another seat. Nothing to steer means a quick glance at the screen is enough.

## Does it show how long I have been at my desk?

No. The office shows who is in which room and their status. It does not show how long someone has sat at a seat or when they last did something, and it never will.

## Why polling and not WebSocket?

The page polls every 4 seconds while visible and sends a heartbeat every 60 seconds while hidden. That works behind any reverse proxy without special configuration.

## Do members need an email address?

No. An admin creates an invite link under Members, and password resets also use a link. There is no email sending and no external login service.

## Can I run two app containers?

No, keep exactly one. See [Operations](../operations/).

## Notifications do not arrive.

Web Push needs HTTPS (or `localhost`), and the person must allow notifications in the browser. See [Calls and notifications](../calls/).

## Does the browser map editor upload my map?

No. The draft stays in your browser's local storage. Clearing site data removes it, so export the JSON to keep a copy.

## An old map no longer imports.

The JSON has a `version` field and the server validates it, telling you what is wrong. Catalog item ids are never removed, so older maps keep working.

## Which license is it?

AGPL-3.0-only. If you modify Pixeloft and let others use it over a network, you must offer them your modified source.

## Can I contribute?

External pull requests are not accepted for now. Bug reports and ideas are welcome as issues.
