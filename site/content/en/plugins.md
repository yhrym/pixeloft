---
title: Writing plugins
order: 7
description: How to write a plugin that adds items, server actions and state, storage, and menus to the office screen. Folder layout, the API of each file, safety notes, and a table of limits.
---
A plugin adds items and small features, such as a game, without touching the app's own code. Put a folder in `plugins/<id>/`, rebuild, and it is picked up. This page is for people who install plugins and people who write them.

If you are writing one, read the [full example](#full-example) first, then come back to the sections on each file. For a bigger example, see `plugins/darts/` in the repository.

## What plugins can and cannot do

A plugin can:

- **Add items.** They show up in the map editor's palette and are placed like built-in items. Size, collision, seats and rotation work the same way. Seats are ordinary seats, so people can sit on them in the office view.
- **Handle actions on the server.** The browser calls `send`, and your server code runs.
- **Publish state.** What the server returns reaches everyone who has the office open about every 4 seconds, and is passed to the item's drawing code.
- **Store data.** Each plugin gets a key-value store (JSON values) that survives restarts.
- **Extend the screen.** A menu entry in the HUD, a button over an item, a small panel in the HUD (the dock), and a dialog styled like the app's own.

A plugin cannot:

- **Be swapped in while the app is running.** Plugins are compiled in at build time. Adding, removing or editing one needs `docker compose up --build`.
- **Be enabled or disabled from the admin screens.** If it is installed, it is on.
- **Run on a schedule.** Server code runs only when the browser asks for something (`state`, `actions`, `get`). There are no timers or background jobs.
- **Add its own pages, routes or tables.** The only endpoint is `/api/office/plugins/<id>`, and data goes in `ctx.store`.
- **Add npm packages just for the plugin.** You can use only what is in the app's `package.json` (React works).
- **Read another plugin's data.** `ctx.store` is scoped to your own plugin.
- **Declare which version of the plugin API it needs.** The API has no version number yet, so check your plugin after upgrading the app.

## Installing and removing

To install:

1. Put the folder in `plugins/<id>/`. Keep the folder name the author chose as the id. If you rename it, the build stops with an error like `plugins/hello2: key "hello:counter" in catalog.js must start with "hello2:"`.
2. Run `docker compose up --build`.

Put nothing but plugin folders directly under `plugins/` (a folder such as `__MACOSX`, which unzipping can create, does not match the id pattern and stops the build). The official `darts` plugin is installed and enabled from the start. Delete `plugins/darts/` if you do not want it.

Item thumbnails need nothing from you if the plugin ships them in its `thumbs/` folder (see [Thumbnails](#thumbnails)).

To remove:

1. Delete the folder.
2. Run `docker compose up --build`.

Items from a removed plugin that are still on the map are handled like this:

- The office view, the seat list and the editor **skip** them. They are not deleted from the map JSON.
- **Publishing** the map fails with "This item belongs to the plugin "…". Reinstall the plugin or delete this item." Delete the item or reinstall the plugin to publish again.
- Stored data is not deleted. If you install a plugin with the same id again, it picks up where it left off. To delete the data too, remove the plugin first, then delete its rows from the `PluginData` table with the line below. **This cannot be undone.** Take a backup first (see [Operations](../operations/)).

```sh
docker compose exec db psql -U vo vo -c "DELETE FROM \"PluginData\" WHERE plugin = '<id>'"
```

## Safety

A plugin runs inside the server process with the same permissions as the app. There is no sandbox. Its code can read and write the database, environment variables and files.

- **Install only plugins whose code you have read.** Do not drop a folder of unknown origin into `plugins/`.
- **Do not trust `payload` or `params`.** Anyone can change what the browser sends with the developer tools. Check types, ranges and lengths in the plugin.
- **Check `ctx.user.isAdmin` for admin-only actions.** Hiding a button in the UI does not stop anyone from sending the action.
- **Do not put secrets in `state`.** It goes to everyone who has the office open. You can return different values per person, but each value ends up in that person's browser, so include only what that person may see.
- **Do not put changes a person did not intend in `state` or `get`.** POST (`actions`) checks the origin and rejects requests from other sites. GET (`get`) rejects with 403 when the `Sec-Fetch-Site` header is `cross-site` or `same-site` (a navigation from another site), but a request without the header (an old browser, `curl`) goes through. `state` is called inside the app's state request (`GET /api/office/state`), which does not check the origin. So keep saves and state changes out of `state` and `get`, and put only work that gives the same result however many times it runs, such as clearing out expired data.
- **Insert text written by people with `textContent`.** Names and messages put into `innerHTML` run scripts in other people's browsers.

```ts
// Checking a payload. Write fail as `return ctx.fail(...)` (the reason is in the "ctx" section)
press: (ctx, payload) => {
  const n = (payload as { n?: unknown } | null)?.n;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) return ctx.fail(400, "plugin.hello.badInput"); // this key must exist in ja.json and en.json
  // from here on, n is a number
}
```

## What goes in the folder

Every file is optional. Create only what you need.

| File | Runs in | Contents |
|---|---|---|
| `catalog.js` | server, browser, editor, static Pages editor | Item definitions. No DOM and no Node-only APIs |
| `draw.js` | the engine (browser) | How items are drawn |
| `server.ts` (or `.js`) | server | `state`, `actions`, `get` |
| `client.ts` (or `.tsx`, `.js`) | the office screen | `export default function setup(api)` |
| `ja.json`, `en.json` | everywhere | Text |

`catalog.js` and `draw.js` are also loaded by Node at build time (`scripts/plugins.mjs` imports them to check their keys). Do not touch the DOM at the top level of the file, and write `import` with relative paths.

The Pages editor is the map editor served from GitHub Pages with no server (built by `npm run build:pages`). It carries only the item definitions and drawings; `server.ts` and `client.ts` do not run there.

### Rules for ids and keys

`scripts/plugins.mjs` inspects the folders before each build (and before `npm run dev`, `test`, `lint`, `build:pages` and `build:thumbs`). It stops with a message (in English) if any of these hold. It checks every plugin before writing anything, so when it stops, `src/plugins/generated/` keeps its previous contents (one typo during `npm run dev` does not remove the other plugins).

- **The id (folder name) does not match `^[a-z][a-z0-9-]{1,30}$`.** Start with a lowercase letter, then lowercase letters, digits and hyphens, 2 to 31 characters in all.
- **A key in `catalog.js` or `draw.js` does not start with `<id>:`.** Item types are `<id>:<name>`, for example `hello:counter`.
- **A key in `ja.json` or `en.json` does not start with `plugin.<id>.` or `catalog.<id>:`.** Text keys are `plugin.<id>.…`, plus `catalog.<id>:<name>` for an item's display name.
- **`ja.json` and `en.json` have different keys.** The keys that exist in only one of them are listed.
- **Only one of `ja.json` and `en.json` exists.** The missing one is named, as in "`en.json is missing`".
- **`catalog.js` or `draw.js` does not `export default` an object, or a JSON file cannot be parsed.**
- **An `import` in `catalog.js` or `draw.js` fails** (a syntax error, say). The message names the file, as in `plugins/<id>/catalog.js: cannot load (…)`.
- **A `thumbs/<name>.png` whose name matches no key in `catalog.js`, or a PNG over 64 KB.** See [Thumbnails](#thumbnails).

If you ship text, you need both `ja.json` and `en.json` (with only one, the build stops). `{name}` placeholders such as `{n}` are filled from the `vars` you pass to `ctx.t` and `api.t`. A missing key is shown as the key itself.

## Full example

`hello` counts button presses. It has an item (a dot is added to its top face per press), a server action and state, storage, a menu entry, a button, a dock panel, and text. Only admins can reset the count.

Put these six files in `plugins/hello/`. The same files are in `examples/hello/`, so you can copy that folder into `plugins/` to start (it includes `server.test.ts`).

`catalog.js`: the item definition, a 16 by 16 box 20 units tall, with one seat in front of it.

```js
// @ts-check
/** @type {Record<string, import("@/plugins/types").PluginItemDef>} */
const defs = {
  "hello:counter": {
    cat: "decor",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [-8, -8, 0, 8, 8, 20] }],
    // A seat in front of the counter. Written for the art direction x+, the other directions are derived by transposing and rotating (a person looking along x+ is SE)
    seats: () => [{ dx: -20, dy: 0, face: "SE", type: "stool" }],
  },
};
export default defs;
```

`draw.js`: draws the box, then one dot on the top face per press (up to 9).

```js
const defs = {
  // one dot on the top face per press (up to 9)
  "hello:counter"(k, d) {
    const n = Math.min(d.state?.count ?? 0, 9);
    k.box(d.x - 8, d.y - 8, 0, d.x + 8, d.y + 8, 20, "Y", "O", "R", "W");
    k.flush();
    for (let i = 0; i < n; i++) {
      k.wp(d.x - 6 + (i % 3) * 4, d.y - 6 + Math.floor(i / 3) * 4, 20, k.cc("K"));
    }
    k.flush(false);
  },
};
export default defs;
```

`server.ts`: `state` returns the count and how many are placed on the map. `press` adds 1 with `update`. `reset` sets it to 0, for admins only.

```ts
import type { PluginServer } from "@/plugins/types";

const server: PluginServer = {
  state: async (ctx) => ({
    count: ((await ctx.store.get("count")) as number | undefined) ?? 0,
    placed: (await ctx.items()).length,
  }),
  actions: {
    press: (ctx) => ctx.store.update("count", (c) => ((c as number | undefined) ?? 0) + 1),
    reset: async (ctx) => {
      if (!ctx.user.isAdmin) return ctx.fail(403, "plugin.hello.adminOnly");
      await ctx.store.set("count", 0);
    },
  },
};
export default server;
```

`client.ts`: shows the count in the dock, and adds a menu dialog and a "Press" button over the item. A failed `send` shows its message in a separate element from the count (the count is rewritten on every `onState`, so a message in the same element would vanish at once). It returns the `onState` remover, so it is called when the screen is torn down.

```ts
import type { PluginApi } from "@/plugins/types";

type State = { count: number; placed: number };

export default function setup(api: PluginApi) {
  const read = () => (api.state() as State | undefined) ?? { count: 0, placed: 0 };

  // dock panel: the press count, rewritten each time a state arrives
  const box = document.createElement("div"), count = document.createElement("div"), err = document.createElement("div");
  box.className = "win";
  box.style.cssText = "padding:4px 8px;font-size:12px";
  box.append(count, err); // failure messages go in their own element (only the count is rewritten on each state)
  api.dock.append(box);
  const show = () => { count.textContent = api.t("plugin.hello.count", { n: read().count }); };
  show();
  const off = api.onState(show);

  // menu: opens a dialog. Reset is admin-only (the server refuses others)
  api.menu(api.t("plugin.hello.menu"), () => {
    const d = api.dialog(api.t("plugin.hello.menu"));
    const info = document.createElement("p");
    info.textContent = api.t("plugin.hello.count", { n: read().count }) + " / " + api.t("plugin.hello.placed", { n: read().placed });
    const reset = document.createElement("button");
    reset.textContent = api.t("plugin.hello.reset");
    reset.className = "pbtn";
    reset.onclick = () => { api.send("reset").then(d.close, (e: Error) => { info.textContent = e.message; }); };
    d.body.append(info, reset);
  });

  // the button over the item (an invisible hit area; hover shows the label, pressing runs this)
  api.onItemClick("hello:counter", api.t("plugin.hello.press"), () => {
    api.send("press").then(() => { err.textContent = ""; }, (e: Error) => { err.textContent = e.message; });
  });

  return off; // called when the screen is torn down (the engine's dispose)
}
```

`ja.json`:

```json
{
  "plugin.hello.menu": "ハローの窓",
  "plugin.hello.count": "押した回数: {n}",
  "plugin.hello.placed": "置いてある数: {n}",
  "plugin.hello.press": "押す",
  "plugin.hello.reset": "リセット",
  "plugin.hello.adminOnly": "リセットは管理者だけです。",
  "catalog.hello:counter": "ハローの置き物"
}
```

`en.json`:

```json
{
  "plugin.hello.menu": "Hello window",
  "plugin.hello.count": "Presses: {n}",
  "plugin.hello.placed": "Placed: {n}",
  "plugin.hello.press": "Press",
  "plugin.hello.reset": "Reset",
  "plugin.hello.adminOnly": "Only admins can reset.",
  "catalog.hello:counter": "Hello item"
}
```

Rebuild with `docker compose up --build`. If you want a thumbnail, first run `npm run build:thumbs` once on the host (it writes `plugins/hello/thumbs/counter.png`; see [Thumbnails](#thumbnails)). In `/editor`, place "Hello item" (in the Decor category) inside a room on the map and publish. In the office view you can sit on the stool in front of the item. Hover over the top of the item and the "Press" label appears (an invisible hit area over the item). Pressing runs `cb`, adds one dot, and raises the count in the dock.

For a bigger example, see `plugins/darts/`. In `server.ts`, `machineOf` shows how to check a payload and `run` shows `update` and `fail`; in `server.test.ts`, `world` shows how to share a store to try several people.

## Defining items (catalog.js)

`export default` an object keyed by `<id>:<name>`. Each definition has the same shape as the ones in the app's own `src/engine/catalog.js`.

```js
const defs = {
  "hello:counter": {
    cat: "decor",
    dirs: ["x+"], art: ["x+"], sym: true,
    props: {},
    boxes: () => [{ b: [-8, -8, 0, 8, 8, 20] }],
  },
};
export default defs;
```

| Field | Meaning |
|---|---|
| `cat` | Palette category in the editor. Pick one of these seven (the palette name in parentheses): `desk` (Desks & seats), `meeting` (Meeting), `lounge` (Lounge), `storage` (Storage), `decor` (Decor), `facility` (Facilities), `season` (Seasonal). If you omit it or use another value, the item goes under "Other" |
| `art` | Optional. Directions you draw art for (`x+`, `y+`, `x-`, `y-`). `draw.js` only draws these. Whether you write it changes how directions work (see "How directions work" below) |
| `sym` | If `true`, the direction turned 180 degrees around the item's center reuses the same art (for items that look the same from both sides) |
| `dirs` | Usable directions (required). Without `art`, only the directions listed here are usable. With `art`, this value is overwritten by `art` plus the directions derived by transposing or rotating |
| `props` | Default per-item settings. Items on the map may override only keys listed here, with the same type; anything else fails the publish check. They appear in the editor's settings panel on their own (a number gets a stepper, a string a text field, a boolean a switch; arrays, objects and `null` do not appear). The label is the text for `editor.prop.<key>`, or the key itself when there is none (a plugin's `en.json` may only hold keys starting with `plugin.<id>.` or `catalog.<id>:`, so it cannot add `editor.prop.…`). A string may be up to 40 characters and a number up to 4096 in absolute value, and anyone can enter any such value, so check it in `draw.js` and on the server before you use it |
| `boxes(dir, props)` | Boxes used for draw order and for blocking movement: `{ b: [x0, y0, z0, x1, y1, z1], block, draw }`. `block` defaults to `true` (people cannot walk through), `draw` to `true` (the draw function is called for it) |
| `seats(dir, props)` | Seats: `{ dx, dy, face, type, … }`. `dx` and `dy` are offsets from the origin, `face` is the direction the seated person looks (`NE`, `NW`, `SE`, `SW` on screen), and `type` is the seat kind (see the table below) |

### How directions work

- **With `art`:** a direction not in `art` is made by **transposing** `x` and `y` (a mirror image on screen). With `sym: true`, the 180-degree direction is available too. `boxes`, `seats` and the drawing are called with an `art` direction, and the engine transposes or rotates them for the other directions. You only write the `art` directions.
- **Without `art`:** only the directions in `dirs` are usable. `boxes`, `seats` and the drawing are called with the real direction, and nothing is transposed or rotated. You write each direction yourself.
- **If you draw text or digits with `spr`, do not write `art`.** The pixel art in `spr` is not mirrored by transposing, so in a transposed direction only the order of the characters is reversed (the "301" on the darts machine read like "103", so `plugins/darts/catalog.js` has no `art` and only `y+`).

A seat's `face` is the direction the seated person looks on screen. When you write seats per direction without `art`, use the `face` of a person looking along the item's direction, from this table (`FACE` in `src/engine/catalog.js`). With `art`, write only the `art` directions; the `face` of a transposed direction is mirrored for you.

| Item direction | `face` of a person looking that way |
|---|---|
| `x+` | `SE` |
| `y+` | `SW` |
| `x-` | `NW` |
| `y-` | `NE` |

An item's origin is the point you placed it at in the editor (it snaps to 8 units). All coordinates in `boxes` and `seats` are offsets from that origin.

**Write `boxes` and `seats` so they never throw.** A user can put any value within range into `props`, so they must not throw for any of them. If one throws, the item loses its boxes and seats (the console logs it once per type), and publishing the map stops with "The plugin "…" threw an error while computing this item's shape or seats".

A seat's id is `<item id>-<number>`, where the number is its position in the `seats` array, counting from 1. A seat whose position is outside every room rectangle does not appear. **A seat inside a meeting room (kind `meeting`) does not become an individual seat.** It is left out of the seat list and used as a chair of that room (`stand` is a standing spot, anything else is drawn as a `meet` chair). Put an item that uses seats outside meeting rooms.

How each `type` differs (from how `office.js` draws them):

| `type` | Sitting height | Automatic seating on entry | Chair |
|---|---|---|---|
| `office` | 8 | Seats in work areas (kind `work`) are the first choice | Drawn by the engine (office chair) |
| `stool` | 14 | Candidates, in `free`, `break` and `hall` rooms, when the work area is full | Drawn (stool) |
| `meet` | 8 | Same | Drawn (meeting chair) |
| `armchair` | 9 | Not picked by the screen's automatic seating | Drawn (with armrests) |
| `desk` | 8 | Not picked by the screen's automatic seating | Drawn |
| `stand` | Standing (on the floor; `z0` is the platform height) | Same as `stool` | Not drawn (a floor mark only) |

`tea`, `dine`, `table`, `cafe`, `fold`, `shell`, `sofa`, `booth`, `focus`, `egg`, `bench`, `pbooth`, `beanbag`, `lstool` and similar are for the app's own items only. If a plugin uses them, the person and chair are not drawn.

Extra `seats` fields (the engine reads them as they are):

- `chair`: the chair color, such as `navy`, `red`, `black` or `hb` (black with a headrest). `meet` also has `yellow`. Omit it for the default color.
- `sz`: the sitting height. It overrides the table value.
- `z0`: the platform height. It is added to the sitting or standing height.
- `sign`: text for the tag shown above the seat.
- `label`: the seat's name (tooltip; omitted, it is "Seat N").

The draw function is not called for a box with `draw: false` (a box that only collides).

### Thumbnails

The picture of an item in the editor's palette and top-down floor plan. Put `plugins/<id>/thumbs/<name>.png` in the plugin and `scripts/plugins.mjs` imports it as the thumbnail of `<id>:<name>`. It is a 64 by 64 PNG made the same way as the built-in items'. Everything works without it.

- **Making it (author):** run `npm run build:thumbs` once on the host and it writes `plugins/<id>/thumbs/`. It redraws the app and every plugin, but a picture that has not changed comes out byte for byte the same, so git shows no diff. Use the same Node as the `Dockerfile` (24); `npm ci` makes puppeteer download Chromium. `public/catalog-thumbs.*` holds the built-in items only and does not change when plugins are present.
- **Shipping it:** hand over `thumbs/` with the rest of the plugin folder. The person installing needs neither Node nor Chromium.
- **Without it:** the palette shows an empty placeholder icon and the floor plan shows a name label. The isometric preview and the office view are drawn by the real engine, so they look right either way.
- **When it stops:** `scripts/plugins.mjs` stops if a file name does not match the part after `<id>:` in a `catalog.js` key, or a PNG is over 64 KB.

### Adding types

`@/plugins/types` (`src/plugins/types.ts`) has the types for plugins. Use them with `import type`.

| Type | Where |
|---|---|
| `PluginServer` | the `export default` of `server.ts` |
| `PluginCtx`, `PluginStore`, `PluginUser`, `PluginPerson`, `PluginRoom`, `PluginMapItem` | the server's `ctx` and its parts (`PluginPerson` is an element of `people()`, `PluginRoom` of `rooms()`, `PluginMapItem` of `items()`) |
| `PluginClientSetup`, `PluginApi`, `PluginDialog` | `setup` in `client.ts`, `api`, and what `api.dialog` returns |
| `PluginItemDef`, `PluginDir`, `PluginBox`, `PluginSeat` | definitions in `catalog.js` |
| `PluginDraw`, `PluginDrawTools`, `PluginDrawArgs`, `PluginItem` | the functions in `draw.js`, `k`, `d`, `d.item` |

Put `// @ts-check` and a JSDoc `@type` at the top of `catalog.js`, and `npx tsc --noEmit` finds mistakes in a definition (a misspelled `face`, the shape of what `boxes` returns).

```js
// @ts-check
/** @type {Record<string, import("@/plugins/types").PluginItemDef>} */
const defs = {
  "hello:counter": { /* … */ },
};
export default defs;
```

`draw.js` is not part of what `npx tsc --noEmit` checks, so the same annotation helps only inside your editor. With the `PluginDraw` type, `d.state` is `unknown`, so cast it with JSDoc where you use it.

```js
// @ts-check
/** @type {import("@/plugins/types").PluginDraw} */
const defs = {
  "hello:counter"(k, d) {
    const state = /** @type {{ count?: number } | undefined} */ (d.state);
    const n = Math.min(state?.count ?? 0, 9);
    // …
  },
};
export default defs;
```

## Drawing (draw.js)

`export default` an object of functions keyed by `<id>:<name>`. Each function receives `(k, d)`: `k` is the toolbox, `d` describes what to draw.

```js
const defs = {
  "hello:counter"(k, d) {
    k.box(d.x - 8, d.y - 8, 0, d.x + 8, d.y + 8, 20, "Y", "O", "R", "W");
    k.flush();
  },
};
export default defs;
```

Fields of `d`:

| Field | Meaning |
|---|---|
| `x`, `y` | The item's origin in world coordinates |
| `dir` | The art direction (one of `art`). Even when the engine draws a transposed or rotated direction, this is the `art` direction |
| `props` | `props` with the catalog defaults and the map's overrides merged |
| `item` | The map item itself (its real `dir` is here) |
| `part` | Index of the box in `boxes` being drawn (from 0) |
| `state` | This plugin's state (the value of the server's `state(ctx)`). `undefined` until the first state arrives |

An item with several `boxes` is drawn once per box, back to front. Look at `d.part` and draw only that box's share.

When the state value differs from the previous one (when a `state` arrives, and after `send`), the map is redrawn right away. An animation can run inside `draw.js` by reading `k.now()` (for how often redraws happen, see [Reference](#redraw-interval)).

If the function throws, the half-drawn layer is thrown away and only that item is skipped. Everything else keeps drawing, and the console logs the error once per type.

### Coordinates and projection

- Coordinates are in world units. A tile is 16 units, and `z` is height (up is positive).
- A world point lands on screen at `x = X - Y` and `y = (X + Y) / 2 - Z`. `k.PX(X, Y)` and `k.PY(X, Y, Z)` compute exactly that.
- Box faces are shaded: the top is lightest, the `+Y` face (left) is mid-tone, and the `+X` face (right) is darkest.

### The toolbox `k`

| Tool | Meaning |
|---|---|
| `box(x0, y0, z0, x1, y1, z1, top, left, right, edge?)` | A cuboid. Colors are single palette characters: top face, left face, right face. `edge` colors the top edges |
| `wp(x, y, z, color)` | One pixel at a world point. `color` is a number, such as `cc("K")` |
| `cc(ch)` | Turns a palette character into the number `wp` takes |
| `flush(outline = true, color = "K")` | Commits what has been drawn so far. With `outline` on, it adds a 1-pixel outline around the committed shape; with `false` it does not |
| `spr(px, py, rows, map?, flip?)` | Puts pixel art at screen position `(px, py)`. `rows` is an array of strings (`.` is transparent), `map` replaces characters (`{ a: "b" }`), `flip` mirrors it horizontally |
| `sprAt(x, y, z, rows, ax, ay, map?)` | Puts pixel art so that its pixel `(ax, ay)` lands on a world point |
| `standAt(x, y, z, rows, map?)` | Puts pixel art so that the middle of its bottom row lands on a world point |
| `paintL(y, x0, zTop, rows, map?)` | Pastes pixel art on a `+Y`-facing (left) face. Columns run along `x` from `x0`, rows run down from `zTop` |
| `paintR(x, y, zTop, rows, map?)` | Pastes pixel art on a `+X`-facing (right) face. Columns run along `-y` from `y` |
| `PX(x, y)`, `PY(x, y, z)` | World point to screen position, for working out positions to pass to `spr` |
| `isLit()` | Whether the lights are on (evening and night) |
| `occupantOf(seatId)` | `{ id, name }` of the person sitting in that seat, or `null` |
| `now()` | Current time in milliseconds, for animation |

`box`, `wp`, `paintL`, `paintR` and the other drawing calls paint into a scratch layer, and `flush()` commits it. A layer committed later covers an earlier one. Item art normally ends with a plain `flush()` so it gets its outline.

### When the engine draws a transposed item

For directions made from `sym` or not listed in `art`, the engine draws the item transposed (`x` and `y` swapped, which is a mirror image on screen).

- `box`, `wp`, `PX` and `PY` swap the coordinates for you. `box` also swaps the left and right face colors so the light still comes from the same side. Your code does nothing special.
- `d.dir` is the original `art` direction, so you never need separate art per direction.
- `spr`, `sprAt` and `standAt` transpose only the position. The pixel art itself is not mirrored, so text or an asymmetric drawing keeps its original orientation even when it lands on the other side.

## The server (server.ts)

`export default` an object `{ state?, actions?, get? }`. Its type is `PluginServer`.

```ts
import type { PluginServer } from "@/plugins/types";

const server: PluginServer = {
  state: async (ctx) => ({ /* ... */ }),
  actions: { press: async (ctx, payload) => { /* ... */ } },
  get: async (ctx, params) => { /* ... */ },
};
export default server;
```

### ctx

The first argument of `state`, every action, and `get`. A new one is built for each call.

| Field | Meaning |
|---|---|
| `user` | The person making the request: `{ id, name, isAdmin }` |
| `locale` | Their language (`"ja"` or `"en"`) |
| `now` | The current `Date` |
| `date` | Today in the configured time zone, as `YYYY-MM-DD` |
| `t(key, vars?)` | Looks up text in their language |
| `store` | Storage (next section) |
| `people()` | Async (`await` it). People present today, as an array of `{ id, name, room, seatId, away }`. `id` is the same kind of id as `ctx.user.id`, and `room` is a room id; look up its name with `rooms()`. `seatId` is `null` for a person who is not on a seat (in a meeting room, or the item was removed so the seat is gone). People who forgot to leave are not included |
| `rooms()` | Async. The rooms of the published map, as an array of `{ id, name, kind, floor }` (`floor` is a floor id; `kind` is one of `work`, `meeting`, `break`, `free`, `hall`) |
| `items()` | Async. This plugin's items on the published map, as `{ id, type, floor, x, y, dir, props }`. `floor` is a floor id, and `props` includes the catalog defaults |
| `fail(status, key, vars?)` | Fails with that HTTP status and the message for the text key. Nothing after the call runs (it returns `never`) |

The message from `fail` is in the caller's language. In the browser, `send` rejects with an `Error` whose `message` is that text (and which carries `status`). If you throw any other error instead, the browser only gets "A server error occurred." (500) and the details go to the server log. Use `fail` for expected failures such as bad input or missing permission.

The key for `fail` can be the plugin's own `plugin.<id>.…` or one of the app's text keys (the darts plugin uses `vo.err.badRequest`). For example `vo.err.badRequest` (The request is malformed.), `vo.err.noSuchRoom` (That room does not exist.), `vo.err.notEntered` (You are not in the office.) and `vo.err.tooFast` (Wait a moment and try again.). The app's keys can change in an update, so for anything long-lived, make your own key.

`fail` returns `never`, but writing only `if (…) ctx.fail(…)` does not make TypeScript narrow types below it. `ctx` is typed from context and has no explicit type annotation, so a line that uses a value that was not narrowed fails the type check in `next build`. Write `return ctx.fail(…)`, or `const v = ok ? x : ctx.fail(…)`.

```ts
reset: async (ctx) => {
  if (!ctx.user.isAdmin) return ctx.fail(403, "plugin.hello.adminOnly");
  await ctx.store.set("count", 0);
},
```

### Storage (ctx.store)

A key-value store for each plugin, kept in the database's `PluginData` table so it survives restarts.

| Function | Meaning |
|---|---|
| `get(key)` | Returns the value, or `undefined` if there is none |
| `set(key, value)` | Saves a value |
| `update(key, fn)` | Saves what `fn(current value)` returns and returns that value. `fn` may be async |
| `delete(key)` | Deletes the key |
| `keys(prefix?)` | Lists keys, optionally only those starting with `prefix` |

- Limits: **a key is a string of 1 to 200 characters, and a value is at most 1 MB as JSON.** Passing a longer key, a larger value, or something that cannot be turned into JSON throws.
- On first use, the plugin's rows are all read into memory. After that, `get` and `keys` read only memory, so calling them inside `state` does not hit the database every 4 seconds. Writes go to both the database and memory.
- `get` and `update` return copies, so changing the returned value does not change what is stored.
- If `fn` in `update` throws (for example `ctx.fail`), nothing is saved, and `update` rethrows. Inside `fn`, write `fail` as a ternary (only `never` joins the return type, so it stays `number`).
- The order of `keys()` is not defined (after a restart it is the order the database returns rows, and keys added later go after them). Sort the result if you need an order.
- All rows are kept in memory, so data that keeps growing, such as a per-day history, needs old entries removed with `delete`.
- **What `update` guarantees:** within one process, calls to `update` for the same (plugin, key) run one after another; the next `fn` starts after the previous one finishes. Write read-modify-write code such as a counter with `update`. With `get` followed by `set`, two simultaneous requests can read the same value and one increment is lost.
- **What it does not guarantee:** `set` and `delete` do not wait in that queue, so the order of a `set` and an `update` arriving at the same time on one key is undefined. An update spanning several keys is not one transaction. Pixeloft assumes a single app process, so races between processes are not handled (see [Operations](../operations/)).

### When state, actions and get are called

| Function | Called when | What you return |
|---|---|---|
| `state(ctx)` | On every state request from the office screen (`GET /api/office/state`), once per person. About every 4 seconds while the tab is visible and about every 60 seconds while it is hidden. Also after each action, for this plugin only | Becomes that person's state: `d.state` in drawing code and `api.state()` in the browser |
| `actions.<name>(ctx, payload)` | When the browser calls `api.send("<name>", payload)` (`POST /api/office/plugins/<id>`). The body is JSON `{ action, payload }`, at most 10,000 characters | Becomes the result of `send` (`undefined` becomes `null`) |
| `get(ctx, params)` | When the browser calls `api.get(params)` (`GET /api/office/plugins/<id>?…`) | Becomes the result of `get` (`undefined` becomes `null`) |

- **Keep `state` cheap.** It runs once per connected person about every 4 seconds, and it is not covered by the 1-second shared cache. `store.get` only reads memory, so it is fine. Do not make network calls or database queries inside `state`.
- **`state` is cut off after 1 second.** Each plugin is waited on for 1 second, and when it takes longer only that plugin's state is left out. This keeps one slow plugin from slowing the app's own state request. The function itself is not stopped when it is cut off; it keeps running (a `store.update` inside it is still saved).
- If `state` throws, only this plugin's state is left out (the browser sees `undefined`) and the error is logged. Other plugins and the app's own state are unaffected.
- Return JSON-serializable values from `state`. What you return replaces this plugin's state as it is (returning `null` makes it `null`; it is not a partial update). Returning `undefined` leaves this plugin out of the state.
- The state after an action works the same way. When `state` returns `undefined`, there is no `state`, it throws, or it is cut off, the response carries no state, and the browser keeps the previous one.
- `get` is for data that only people with a certain window open need at a short interval (every second, say). Nothing calls it automatically; your browser code calls it, for example from `setInterval`. A GET to a plugin without `get` returns 404 with "This plugin does not accept GET requests." (different from the 404 for an unknown plugin). A GET whose `Sec-Fetch-Site` is `cross-site` or `same-site` returns 403.
- An action name that is not in `actions`, or a plugin with no `actions`, returns 400. An unknown plugin returns 404.
- `params` holds the query string as a `Record<string, string>` (if a name repeats, the last value wins). `?since=` arrives as a plain string like any other name.
- Requests that are not logged in are rejected before they reach your code. The origin is checked only for POST (`actions`) and, through `Sec-Fetch-Site`, for GET. `state` does not check the origin (see [Safety](#safety)).

## The browser (client.ts)

Write `export default function setup(api)`. `api` is a `PluginApi`.

`setup` runs once per plugin, just before the office screen creates the engine. **`menu` and `onItemClick` only take effect when called synchronously inside `setup`.** Calls made later, or from inside async code, do not show up. If `setup` throws, only that plugin's screen parts are missing; nothing else is affected. If `setup` returns a function, it is called as cleanup when the screen is torn down (the engine's `dispose`). Return what removes your `onState` listener, React's `root.unmount()` and the like (the darts plugin returns its `unmount`, delayed with `queueMicrotask` because cleanup can run while React is rendering).

| Member | Meaning |
|---|---|
| `id`, `locale` | The plugin id and the screen's language |
| `t(key, vars?)` | Looks up text |
| `send(action, payload?)` | Calls a server action and returns a `Promise` of its result. The state after the action is pushed straight to the drawing code and `onState`. Failure is an `Error` whose `message` is the server's message (with `status`) |
| `get(params?)` | Calls the server's `get` |
| `state()` | The current state (the value of the server's `state(ctx)`), or `undefined` if none has arrived |
| `onState(cb)` | Calls `cb(state)` each time a state is received (even if the value did not change), about every 4 seconds (about every 60 seconds while the tab is hidden), and after `send`. Returns a function that removes it |
| `me()` | `{ id, name, isAdmin, room, seatId }`. `room` and `seatId` are `null` when not present |
| `menu(label, onClick)` | Adds an entry to the HUD menu (call it in `setup`) |
| `onItemClick(type, label, cb)` | Shows a button labeled `label` over items of that type; pressing it calls `cb(item)` (call it in `setup`). `item` has the same shape as an element of `ctx.items()` (`PluginMapItem`): `floor` is the id of the floor being viewed, and `props` include the catalog defaults. It appears only on the floor being viewed, and not in the editor preview. Calling it twice for one `type` keeps the later one |
| `dock` | Where small panels go in the HUD (an `HTMLElement`). Build the contents with the DOM. Each plugin gets its own container |
| `dialog(title)` | Opens a dialog styled like the app's. Returns `{ body, close }`; put your content in `body`. Closing removes it from the DOM |

Dock panels and dialogs match the app when they use its classes and CSS variables (they are in `src/engine/office.css`; they are internals of the app, so they can change in an update).

| Class | Use |
|---|---|
| `win` | The frame (navy background, double white and black border). Put it on an element in `dock` to match the app's windows. The outer element of `api.dialog` is a `win`, and its `h3` title and `x` close button are the app's own |
| `pbtn` | A button. `pbtn sm` (small), `pbtn go` (green primary button), `pbtn ghost` (outline only, for use on the navy background) |

| CSS variable | Meaning |
|---|---|
| `--vo-font` | The app's typeface |
| `--hud-top` | Height of the top bar |
| `--cb` | Where the top of the bottom card is, measured from the top of the screen (the darts plugin uses it in `max-height` so its window does not cover the card) |
| `--k`, `--o`, `--N`, `--l`, `--Y` | The app's colors (black, off-white, navy, green, pale yellow) |

A `<button>` or `<input>` inside a dialog looks like the browser's plain default unless you give it a class. Give buttons `pbtn`. The app has no class for text inputs, so style them with `style` or your own CSS: background `var(--o)`, text and border `var(--k)`.
 If you use React, call `createRoot` on an element inside `dock` yourself. You can load CSS from `client` with `import "./darts.css";` (see `plugins/darts/darts.css`). Give the class names a per-plugin prefix so they do not collide with the app's (the darts plugin uses `vo-darts-`).

### The production CSP

Only in production (`NODE_ENV=production`) a Content-Security-Policy is sent (`next.config.ts`). Browser code can load things only from your own site: `connect-src 'self'` (targets of `fetch`, WebSocket and the like), `img-src 'self' data: blob:` and `font-src 'self' data:`, and `script-src` and `default-src` are also your own site only. Fetch external APIs and images through the server's `get` or `actions` instead of from the browser. `npm run dev` sends no CSP, so something that works there can still be blocked in production.

## Development workflow

1. Write your files in `plugins/<id>/`. You can start by copying `examples/hello/` into `plugins/` (see [Full example](#full-example)).
2. For the database setup and so on, see the [Development section of Operations](../operations/#development). Start with `npm run dev`, then the office screen is at `/` and the editor at `/editor`. Before it starts, `scripts/plugins.mjs` runs and writes the import files to `src/plugins/generated/` (git-ignored). It also runs before `npm run build`, `test`, `lint`, `build:pages` and `build:thumbs`. If you run `next dev` or `tsc` directly, run `node scripts/plugins.mjs` by hand first.
3. When you add, remove or rename a plugin folder or file, run `node scripts/plugins.mjs` again, because the generated files change. Editing the contents of an existing file does not need regeneration.
4. `npm test` runs `plugins/**/*.test.ts` and `examples/**/*.test.ts` as well as the `*.test.ts` files under `src/`. They are `node:test` files; see "Writing tests" below for building a `ctx`. Because `node` runs the tests directly, the `@/` path alias works only for `import type`. Anything that `server.ts` and the files it imports load at runtime (when a test imports them) needs a relative path with the extension, such as `../../src/.../xxx.ts`. `node scripts/plugins.mjs` and the tests print a `MODULE_TYPELESS_PACKAGE_JSON` warning, which is harmless (`package.json` has no `type`, so Node re-reads the file as a module).
5. Once you have made an item, run `npm run build:thumbs` once on the host to make its thumbnail in `plugins/<id>/thumbs/` (see [Thumbnails](#thumbnails)).

### Writing tests

`makeTestCtx(overrides?)` in `src/plugins/testing.ts` builds a test `ctx` of type `PluginCtx`. Its `store` is the real `makeStore` given an in-memory database, so the order of `update` and the copying behave as in production. `fail` throws the same `VoError` as the real one (it has `status`, and the text key as `message`). `user` (by default a non-admin `u1`), `locale`, `now`, `date`, `t` (returns the key), `people`, `rooms`, `items` and `store` can be overridden by argument. `people`, `rooms` and `items` are async functions that return an empty array by default (write `people: async () => [{ id: "a", … }]`). `store` is a new in-memory database on every call. To try the same data as another person, pass `store` as in `makeTestCtx({ store: a.store })` in the example below. When you pull an item in `items` out into a variable, write its `dir` as `"x+" as const` (otherwise it widens to `string` and the types do not match).

The same as `examples/hello/server.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { makeTestCtx } from "../../src/plugins/testing.ts";
import server from "./server.ts";

test("press adds one each time", async () => {
  const ctx = makeTestCtx();
  await server.actions!.press(ctx, undefined);
  await server.actions!.press(ctx, undefined);
  assert.deepEqual(await server.state!(ctx), { count: 2, placed: 0 });
});

test("reset is admin-only", async () => {
  const ctx = makeTestCtx();
  // an action returns unknown | Promise<unknown>, so wrap it in async before passing it to rejects
  await assert.rejects(async () => server.actions!.reset(ctx, undefined), { status: 403, message: "plugin.hello.adminOnly" });
  await server.actions!.reset({ ...ctx, user: { ...ctx.user, isAdmin: true } }, undefined);
});

test("another person sees the same count", async () => {
  const a = makeTestCtx({ user: { id: "a", name: "A", isAdmin: false } });
  const b = makeTestCtx({ store: a.store }); // passing the store gives the same data; leave it out for separate data
  await server.actions!.press(a, undefined);
  assert.deepEqual(await server.state!(b), { count: 1, placed: 0 });
});
```

The return type of an action is `unknown | Promise<unknown>`, so pass `assert.rejects` a function wrapped as `async () => …`. Without the wrapper the types do not match, and an action that throws synchronously leaks the exception into the test itself.

## Reference

### Redraw interval

Independently of state, the engine redraws every 0.5 seconds while the window has focus (every 0.1 seconds while someone is walking or being dragged, every 0.2 seconds while a door or an emote is moving) and every second without focus. It does not draw while the tab is hidden. Each redraw calls the functions of the items in the visible area, so an animation can run inside `draw.js` by reading `k.now()`. A value that changes every time (such as a timestamp) in state causes one extra redraw each time a state arrives (about every 4 seconds), which is not worth avoiding when redraws already happen every 0.5 seconds. The darts plugin puts `now` in its `state` to sync the remaining turn time to the server's clock.

### Palette characters

A color is one character. The engine adjusts brightness for the time of day and the weather. These are the ones you will use most (the full list is `PAL` in `src/engine/sprites.js`):

| Family | Characters (light to dark) |
|---|---|
| Neutral | `W` (white), `V`, `U` / `l`, `m`, `n`, `k`, `K` (near black, the outline color) |
| Wood and brown | `a`, `b`, `c`, `d`, `e` |
| Beige | `f`, `g`, `h` |
| Skin | `S`, `s`, `t` |
| Green | `p`, `q`, `r` |
| Light blue, blue | `G`, `H` / `B`, `N` |
| Red | `R`, `Q` |
| Yellow, orange | `Y`, `O` |
| Teal | `T`, `J` |
| Gray surfaces | `u`, `v`, `w` (asphalt), `X`, `Z` (stone) |
| Other | `+` (pink), `I` (brass), `*` (a light source, which stays bright at night) |

`x`, `z` and `i` are for the sky and distant scenery outside windows, and change with the time of day and weather.

### Limits

| Item | Limit | Notes |
|---|---|---|
| id | `^[a-z][a-z0-9-]{1,30}$` (2 to 31 characters) | Checked by `scripts/plugins.mjs` at build time |
| `store` key | A string of 1 to 200 characters | Longer throws |
| `store` value | At most 1 MB as JSON (1,048,576 bytes) | Values that cannot be JSON, such as `undefined`, also throw |
| Action body (`{ action, payload }`) | At most 10,000 characters | Longer returns 413 |
| State refresh interval | About 4 seconds while visible, about 60 seconds while the tab is hidden | Grows up to 30 seconds after repeated failures |
| `get` interval | None | Your browser code decides |
| One map | 5 floors, 64 by 64 tiles per floor, 2 MB of JSON | See [Map editor](../map-editor/) |
