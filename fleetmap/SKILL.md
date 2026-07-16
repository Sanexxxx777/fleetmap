---
name: fleetmap
description: Turn a running process fleet (or a description of one) into a self-contained HTML architecture diagram. Use when the user wants to map, diagram, or visualize the processes on a server — pm2/systemd zoos, WebSocket relays, workers, bots, databases — grouped by host with health status.
---

# fleetmap

Build a **fleet.json** and render it to a single self-contained HTML diagram.

## When to use
- The user pastes a `pm2 jlist` / `pm2 list` and wants a picture of what runs where.
- The user describes a set of processes/services and how they connect.
- The user wants to document a server's runtime architecture for a README or a teammate.

## Steps

1. **Get the node list.**
   - If the user has pm2: run `pm2 jlist | node fleetmap/collectors/collect-pm2.mjs --group-label <host> --title "<host>"` (or pipe a pasted jlist into the same collector). This yields accurate nodes with health + `meta` badges.
   - If it's a description: write `fleet.json` by hand following `schemas/fleet.schema.json`.

2. **Add the edges.** The collector cannot know what streams to what — read the user's config/description and add `edges` (`ws`/`http`/`db`/`tg`/`ipc`/`file`, `bidi` where two-way). Keep labels short (port, payload).

3. **Group by host.** One `group` per server; leave third-party/managed services (exchanges, mail, object storage) ungrouped — they render in the *External* lane.

4. **Render:** `node fleetmap/bin/fleetmap.mjs render fleet.json -o fleet.html`. Open it, press `T` for theme, `E` to export PNG/SVG.

5. **Iterate by chat.** "add redis", "move the bot to host-2", "mark beta stopped" → edit fleet.json, re-render.

## Rules
- Never invent health you don't know — leave it `unknown` (yellow).
- Never put real secrets, tokens, or private IPs in labels/meta. Ports and process names are fine; credentials are not.
- The output HTML has zero dependencies and makes no network requests — safe to share as a file.
- Keep node count reasonable (schema caps at 80); for huge fleets, render per host.

## Files
- `schemas/fleet.schema.json` — the input contract.
- `collectors/collect-pm2.mjs` — pm2 jlist → fleet nodes.
- `renderers/render-fleet.mjs` — fleet.json → HTML (`validateFleet`, `renderFleet`).
- `bin/fleetmap.mjs` — `render` and `collect` commands.
- `examples/` — a web-platform fleet and a trading fleet to copy from.
