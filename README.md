# Domain Clash: Cursed Arena

A zero-dependency static card battler inspired by Jujutsu Kaisen. It runs on GitHub Pages and uses native ES modules, the Canvas API, and Web Audio API.

## Start a run

Serve the project folder with a local static server, or publish the repository root with GitHub Pages. ES modules generally do not run from a `file://` URL.

```sh
python -m http.server 8000
```

Open `http://localhost:8000`, pick Yuji, Megumi, Nobara, or Gojo, then start the expedition. On GitHub, open **Settings → Pages**, publish from your branch's `/ (root)` folder, and use the Pages URL shown there.

## Controls

| Input | Action |
| --- | --- |
| Tap or click a card | Play the card |
| `1`–`4` | Play a hand card |
| `Space` or **Hit** | Lock attack timing |
| `E` | End turn |
| `D` | Activate Domain Expansion |
| Sound button | Toggle synthesized audio |

## Mechanics

Attacks open a 1.4 second timing sweep. The center zone lands Black Flash (2.5× damage, extra Domain Gauge, and +1 CE); the wider outer zone deals 1.25× damage. Defense cards add Block, healing cards restore HP, and status effects alter damage or apply burn. Domain Expansion lasts three player turns and makes attacks deal 1.75× damage while bypassing enemy Block.

Each run samples four opponents from the enemy roster and ends with Ryomen Sukuna. Defeating him reveals his Heian Era second phase. Choose one of three random card rewards and recover 20 HP after each earlier stage. Lifetime best stage, Black Flashes, and clears are stored in local storage as `domain_clash_stats`.

## Portrait assets

Add optional lowercase JPEG portraits at the paths under `assets/characters/` and `assets/enemies/`. If an image is absent or fails to load, the game displays a matching in-game cursed-sigil fallback without showing a broken-image icon.
