# PlayRush advertisement automation

The script selects a random game from the configured list, clicks **Play Now**
and **Let's Play**, watches and closes the ad, plays the actual game for exactly
2 minutes, exits it, then repeats with a different random game. The browser
window is visible by default and popup game/ad tabs are closed automatically.
During play, the automation uses clicks, swipes/drags, arrow keys, Space, and
Enter to interact with common game types. It reads visible instruction text to
prefer the appropriate controls, advances when a **Next Level** or similar
button appears, and gives each game two minutes. At the time limit it clicks
**Skip Level** when available; otherwise it refreshes the embedded game before
moving to the next game.

## Setup

```bash
npm install
npm run install-browser
```

## Run with the browser visible

```bash
npm start
```

The browser window opens and the process continues until stopped with `Ctrl+C`.
If no advertisement appears for five consecutive ad timeouts, the current
browser session is automatically closed and restarted in headless mode in the
same terminal.

Run one cycle as a test:

```bash
npm run test:cycle
```

Run in the background without a visible browser only when needed:

```bash
HEADLESS=true npm start
```

Optional settings:

```bash
GAME_COUNT=8 MIN_GAME_PLAY_SECONDS=120 MAX_GAME_PLAY_SECONDS=120 npm start
```

- `GAME_COUNT`: number of cycles; `0` means continuous (default `0`)
- `AD_WATCH_SECONDS`: minimum ad viewing time (default `5`)
- `AD_TIMEOUT_MS`: ad detection timeout before retrying (default `30000`)
- `NO_AD_HEADLESS_RESTART_COUNT`: consecutive no-ad timeouts before restarting
  in headless mode (default `5`)
- `MIN_GAME_PLAY_SECONDS`: shortest play time per game (default `120`)
- `MAX_GAME_PLAY_SECONDS`: longest play time per game (default `120`)
- `AUTO_PLAY`: set to `false` to disable automatic game interaction
- `BETWEEN_GAMES_MS`: pause between cycles (default `2000`)
- `HEADLESS`: set to `true` to hide the browser (visible by default)
