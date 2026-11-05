---
title: FAQ
order: 8
description: Short answers about walking, going away, privacy, polling, cost, where data is stored, accounts, licensing and contributions.
---
## Why do characters not walk around?

There is nothing to steer: when you pick a seat, your character walks there by itself. A quick look at the screen shows who is where.

## Does leaving the office open keep me present?

No. After 15 minutes without interacting with the office tab, you are marked away. Mouse, keyboard and touch input in the visible office tab count as interacting with it. Working in another tab while the office tab sits untouched also counts as idle.

## Does it show how long I have been at my desk?

No. The office shows who is in which room and their status. It does not display time spent at a seat or the time of the last interaction with the office tab.

## Why polling and not WebSocket?

The page polls every 4 seconds while visible and sends a heartbeat every 60 seconds while hidden. Pixeloft uses HTTP polling, so you do not need to configure your reverse proxy for WebSocket connections. For the setup when you serve it over HTTPS, see [Calls and notifications](../calls/).

## Does it cost anything?

No. Pixeloft is open source under AGPL-3.0-only and has no paid plan. If you rent a server or other hosting, that is the only cost.

## Where is my data stored?

A map draft made in the browser editor is saved in this browser's local storage. Use **Export JSON** to keep a copy. The data of a Pixeloft you run yourself is stored in the PostgreSQL volume `pgdata`; see [Operations](../operations/) for how to back it up. Nothing is sent to the project in either case.

## Do members need an email address?

No. An admin creates an invite link under **Manage members**, and password resets also use a link. There is no email sending and no external login service.

## Can I run two app containers?

No, keep exactly one. See [Operations](../operations/).

## Notifications do not arrive.

Web Push needs HTTPS (or `localhost`), and each person must turn on **Notify me when called** in the office and also allow notifications in the browser. See [Calls and notifications](../calls/).

## Does the browser map editor upload my map?

No. The draft stays in your browser's local storage. Clearing site data removes it, so export the JSON to keep a copy.

## An old map no longer imports.

If the import fails, check the error message. Make sure the file is valid map JSON and does not exceed 2 MB. If it imports but problems are listed, work through the list under **Checks** in the editor. In the app's `/editor`, the server also validates the map on import and before publishing, and tells you what is wrong. Catalog item ids are never removed, so older maps keep working.

## Which license is it?

AGPL-3.0-only. If you modify Pixeloft and let others use it over a network, you must offer them your modified source.

## Can I contribute?

External pull requests are not accepted for now. Bug reports and ideas are welcome as Issues.
