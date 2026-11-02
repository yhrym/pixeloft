---
title: Map editor
order: 2
description: Tools, shortcuts, moving JSON between the browser version and your instance, publishing, and what happens to people who are seated.
---
The map editor draws the floor plan. You edit on a top-down 2D grid and see an isometric preview drawn by the same engine as the app. It exists in two places:

- **In the app** at `/editor` (admins only). It saves a draft on the server and lets you publish.
- **In the browser** as a static page: the **Build your map in the browser** button on this site. It stores the draft in your browser's local storage and sends nothing to a server. There is no login, publishing or version list.

## What you can place

A map is a JSON file with up to 5 floors. Each floor has:

- **Rooms**: rectangles (a room can have several) with a name and a kind: Work, Meeting, Break, Free space or Hall. A room can have a sign position and a floor pattern, and can be marked outdoor.
- **Walls** and **doors**: walls follow cell edges, doors sit on walls.
- **Items**: furniture and decoration from the palette, such as desks, sofas, whiteboards and plants. Seats come from items like desks and chairs.
- **Backdrop**: city or countryside outside the building.

A floor is at most 64 by 64 cells. A map name and other text fields are at most 40 characters, and the JSON file at most 2 MB.

## The layout

The tool rail is on the far left (Select, Room, Wall, Door, Items). The Items palette sits next to it, with a search box and categories. The 2D plan is in the middle, with floor tabs on top and a zoom control in the corner. The right panel has an isometric preview (**Expand** makes it bigger), **Properties** for whatever is selected, and **Checks**. The **...** menu at the top right has Export JSON, Import JSON, Open sample and the shortcut list.

## Tools

| Tool | What it does |
|---|---|
| Select | Click to select. Drag an item to move it, or drag a room corner to resize it. |
| Room | Drag to make a room. Right after drawing, a small **Room settings** popover asks for the name and kind. Hold <kbd>Shift</kbd> while dragging to add a rectangle to the selected room instead of making a new one. |
| Wall | Drag along cell edges to draw a wall. Two buttons above the plan draw walls in bulk: **Draw outer walls automatically** and **Draw walls between rooms**, each with its own wall type. |
| Door | Hover a wall and click to place a door. |
| Items | Pick an item in the palette and click the plan to place it. Dragging an item from the palette and dropping it on the plan works too. |

## Shortcuts

Press <kbd>?</kbd> in the editor to see the same list.

| Action | Key |
|---|---|
| Select tool | <kbd>V</kbd> or <kbd>1</kbd> |
| Room, Wall, Door, Items tools | <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd>, <kbd>5</kbd> |
| Rotate the selected item | <kbd>R</kbd>, and <kbd>Shift</kbd>+<kbd>R</kbd> the other way |
| Delete the selection | <kbd>Delete</kbd> or <kbd>Backspace</kbd> |
| Move | Arrow keys: the selected item by one step (8 units), or the view when nothing is selected |
| Undo / redo | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd>, <kbd>Shift</kbd>+<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd> (or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Y</kbd>) |
| Save | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd> |
| Duplicate | <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>D</kbd> |
| Zoom | Mouse wheel, <kbd>+</kbd> / <kbd>-</kbd> |
| Pan | <kbd>Space</kbd> and drag, or right or middle button drag |
| Add a rectangle to the selected room | <kbd>Shift</kbd> and drag with the Room tool |
| Deselect, or close a popover or dialog | <kbd>Esc</kbd> |

Edits are saved on their own a moment after you stop (the badge at the top shows Saved, Not saved or Saving).

## Getting started checklist and Checks

A new, empty map shows a small **Your first map** checklist: make a room, place an entrance, place a desk, then export (or publish in the app). You can dismiss it.

The **Checks** section of the right panel lists problems as you work. Some entries have a fix button next to them: **Find entrances** highlights the elevators, stairs and entrance doors when a floor has no entrance, **Place a door** switches to the Door tool with the room selected, and **Select the other one** jumps to the other object in an overlap.

## Moving JSON between the browser version and your instance

Both versions use the same JSON format, which has a `version` field.

**Browser to your instance**

1. In the browser editor, choose **Export JSON**.
2. In your instance, open `/editor` and choose **Import JSON**. Fix any errors in the list.
3. Choose **Publish**.

You can also pick the file on the first `/setup`.

**Your instance to the browser**

1. In `/editor`, choose **Export JSON**.
2. In the browser editor, choose **Import JSON**.

**Open sample** loads the bundled fictional office as your draft. If your draft is not empty it asks first. Undo brings your previous draft back, and exporting first is safer.

## Publishing

In the app, **Save draft** keeps your work-in-progress and **Publish** makes it the live map.

Before it goes live, the server validates the map and lists what is wrong. Typical problems are a seat outside any room, overlapping objects, limits exceeded, or no entrance. Errors block publishing, warnings do not. The editor shows the same checks while you work.

Each publish adds a new version. **Versions** lists the earlier ones, and **Publish this version** puts an old one live again as a new version. Catalog item ids are never removed, so older maps keep working.

### What happens to people who are seated

When you publish, anyone whose seat or room no longer exists is moved to a common area **without a seat**, and they see a notice that the seat is gone. They can pick a new seat. Everyone else stays where they are. Check the preview and the validation list before you publish a map while people are in the office.
