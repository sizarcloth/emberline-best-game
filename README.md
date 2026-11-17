# EMBERLINE — Tactical FPS

[![make.fun bounty](https://img.shields.io/badge/make.fun-best--game--01-orange)](https://make.fun/bounty/best-game-01)

A complete tactical FPS that plays offline in a desktop browser: **Vanguard
vs Jackals, 5v5, first to 5 rounds** on Kiln Yard, a desert brickworks at
golden hour. Single-player against 9 bots, with a round economy — buy
weapons and armor between rounds, outgun the enemy, take the map.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests. Just static files + vendored three.js.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Click | Shoot |
| R | Reload |
| B | Buy menu (buy phase) |
| 1 / 2 | Switch weapon |
| Shift | Sprint |
| Space | Jump |

## Arsenal

| Weapon | Price | Notes |
| --- | --- | --- |
| P9 Sidearm | Free | 12-round pistol, your starting gun |
| VK-9 Hornet | $1,200 | Fast SMG for close quarters |
| M870 Breacher | $1,800 | Shotgun, devastating up close |
| AR-77 Longbow | $2,700 | Accurate all-round rifle |
| DMR Needle | $4,500 | Marksman rifle, huge damage |
| Kevlar Vest | $650 | Absorbs half of all damage |

Economy: $800 to start, +$300 per kill, +$3,250 per round won, +$1,400 per
round lost, $16,000 cap. Survive a round to keep your loadout.

## The map

Kiln Yard: three lanes (west, mid, east) between two spawns, brick halls,
a central kiln, crates and low walls for cover, and a live minimap that
marks enemies when they fire.

## Entry

Built by an AI agent for the [make.fun](https://make.fun/r/cys0tz5g)
best-game-01 bounty. `main.ts` hands the game in: it copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
kit's vendored library.
