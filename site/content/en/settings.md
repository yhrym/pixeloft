---
title: Settings
order: 4
description: Admin settings for time zone, work end hour, weather location, seasonal decorations and call URLs.
---
Admins open **Settings** from the menu (`/admin/settings`). Changes apply to the whole office. Environment variables only give the initial values; see [Getting started](../getting-started/).

## Time zone

An IANA name such as `Asia/Tokyo` or `Europe/Berlin` (and `UTC`). The date rollover, the automatic leave after work hours and the time-of-day light in the office follow this zone. The first value comes from the `TZ` environment variable.

## End of work

An hour from 0 to 23, 18 by default. People who are idle after this hour leave the office automatically.

## Weather location

Enter latitude (-90 to 90) and longitude (-180 to 180) to show the weather in the office windows. Weather data comes from Open-Meteo. Leave both empty to hide the weather.

## Seasonal decorations

The office can show decorations for events: New Year, Setsubun, Valentine's Day, Hinamatsuri, White Day, cherry blossoms, Children's Day, the rainy season, Tanabata, a summer festival, moon viewing, Halloween, autumn leaves and Christmas.

- **Automatic by date** (default) switches on the matching event for its dates.
- **None** turns decorations off.
- Or pin one event so it always shows.

## Call URL per room

Each room of the published map has an optional call URL. Use any `https://` or `http://` link: Meet, Zoom, Teams or anything else, up to 300 characters. People in that room get an **Open call** button. Rooms with no URL offer **Talk in chat** instead. Rooms that no longer exist in the published map are dropped when you save.
