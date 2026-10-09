import { chromium } from 'playwright';

const config = {
  // Keep the browser visible by default. Set HEADLESS=true only when needed.
  headless: process.env.HEADLESS === 'true',
  slowMo: positiveNumber(process.env.SLOW_MO_MS, 50),
  adTimeoutMs: positiveNumber(process.env.AD_TIMEOUT_MS, 30_000),
  noAdHeadlessRestartCount: Math.max(1, Math.floor(
    positiveNumber(process.env.NO_AD_HEADLESS_RESTART_COUNT, 5),
  )),
  adWatchMs: positiveNumber(process.env.AD_WATCH_SECONDS, 5) * 1000,
  minGamePlayMs: positiveNumber(process.env.MIN_GAME_PLAY_SECONDS, 120) * 1000,
  maxGamePlayMs: positiveNumber(process.env.MAX_GAME_PLAY_SECONDS, 120) * 1000,
  autoPlay: process.env.AUTO_PLAY !== 'false',
  gameCount: Math.floor(positiveNumber(process.env.GAME_COUNT, 0)),
  betweenGamesMs: positiveNumber(process.env.BETWEEN_GAMES_MS, 2_000),
};

const targetGameUrls = [
  // 'http://94.136.185.237/react_project/game/v2/game/dd-bubble-up',
  // 'http://94.136.185.237/react_project/game/v2/game/burger-game-burger-shop',
  'http://94.136.185.237/react_project/game/v2/game/water-flow-happy-glass',
  // 'http://94.136.185.237/react_project/game/v2/game/bridge-builder',
  'http://94.136.185.237/react_project/game/v2/game/bridge-dash',
  'http://94.136.185.237/react_project/game/v2/game/draw-bridge--brain-game',
  'http://94.136.185.237/react_project/game/v2/game/bounce-td',
  'http://94.136.185.237/react_project/game/v2/game/hipsters-vs-rockers',
];

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function performGameAction(page, iframe, instructions = '') {
  const box = await iframe.boundingBox().catch(() => null);
  if (!box || box.width <= 40 || box.height <= 40) return;

  const point = () => ({
    x: box.x + randomBetween(box.width * 0.15, box.width * 0.85),
    y: box.y + randomBetween(box.height * 0.15, box.height * 0.85),
  });
  const prefersKeyboard = /arrow|keyboard|key|space|jump|move|steer/i.test(instructions);
  const prefersDrag = /drag|swipe|draw|connect|slide/i.test(instructions);
  const prefersClick = /click|tap|select|match|choose/i.test(instructions);
  const action = prefersKeyboard ? 0.9
    : prefersDrag ? 0.65
      : prefersClick ? 0.2
        : Math.random();

  if (action < 0.55) {
    const target = point();
    await page.mouse.click(target.x, target.y);
  } else if (action < 0.8) {
    const start = point();
    const end = point();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  } else {
    // The preceding iframe click gives keyboard focus to the embedded game.
    const focus = point();
    await page.mouse.click(focus.x, focus.y);
    const key = randomItem(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter']);
    await page.keyboard.press(key);
  }
}

async function readGameInstructions(frame) {
  const text = await frame.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
  const usefulLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /how to|instruction|arrow|keyboard|space|click|tap|drag|swipe|draw|move|match/i.test(line));
  return usefulLines.slice(0, 8).join(' ');
}

async function clickFrameButton(page, name) {
  for (const candidateFrame of page.frames()) {
    const button = candidateFrame.getByRole('button', { name }).first();
    try {
      if (await button.isVisible() && await button.isEnabled()) {
        const label = (await button.textContent() || await button.getAttribute('aria-label') || 'control').trim();
        await button.click();
        return label;
      }
    } catch {
      // A game can replace its frame or completion dialog between checks.
    }
  }
  return null;
}

async function advanceCompletedLevel(page) {
  const label = await clickFrameButton(
    page,
    /next(?:\s+level)?|continue|play next|proceed|level up/i,
  );
  if (!label) return false;
  console.log(`Level completed. Clicked "${label}".`);
  return true;
}

async function skipOrRefreshLevel(page, iframe) {
  const label = await clickFrameButton(page, /skip(?:\s+level)?/i);
  if (label) {
    console.log(`Two-minute limit reached. Clicked "${label}".`);
    return 'skipped';
  }

  await iframe.evaluate((element) => {
    const currentSource = element.getAttribute('src');
    if (currentSource) element.setAttribute('src', currentSource);
  }).catch(() => {});
  console.log('Two-minute limit reached. No Skip Level control was found, so the game was refreshed.');
  return 'refreshed';
}

async function startGame(page) {
  const playButton = page.getByRole('button', { name: /play now/i });
  await playButton.waitFor({ state: 'visible', timeout: 30_000 });
  await playButton.click();

  const iframe = page.locator('iframe').first();
  await iframe.waitFor({ state: 'visible', timeout: 45_000 });
  const iframeHandle = await iframe.elementHandle();
  const frame = await iframeHandle?.contentFrame();
  if (!frame) throw new Error('The game iframe was found, but its content did not load.');
  await frame.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {});
  return { iframe, frame };
}

async function launchEmbeddedGame(page, iframe, frame) {
  const launchButton = frame.getByRole('button', {
    name: /let['’]?s play|play game|start game|start/i,
  }).first();

  try {
    await launchButton.waitFor({ state: 'visible', timeout: 15_000 });
    await launchButton.click();
    console.log('Clicked the game launch button.');
  } catch {
    // Some providers use a canvas instead of an accessible launch button.
    const box = await iframe.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      console.log('Clicked the game area to launch it.');
    }
  }
}

async function closeAdvertisement(page) {
  const deadline = Date.now() + config.adTimeoutMs;
  let adSeen = false;
  let adSeenAt;

  while (Date.now() < deadline) {
    // Ads are rendered in a nested third-party iframe. Exclude the main frame
    // so this cannot accidentally click the site's "Exit Game" control.
    for (const candidateFrame of page.frames().filter((item) => item !== page.mainFrame())) {
      const closeButton = candidateFrame.getByRole('button', {
        name: /close ad|skip ad|close advertisement/i,
      }).first();

      try {
        if (await closeButton.isVisible()) {
          if (!adSeen) {
            adSeen = true;
            adSeenAt = Date.now();
            console.log(`Advertisement detected. Watching for at least ${config.adWatchMs / 1000} seconds...`);
          }
          const label = `${await closeButton.getAttribute('aria-label') || ''} ${await closeButton.textContent() || ''}`;

          if (Date.now() - adSeenAt < config.adWatchMs) continue;

          // Some ads expose the close button during the countdown but do not
          // accept a click yet. Wait until "Skip in Ns" has finished.
          if (/\b(?:skip|close)\s+in\s+\d+/i.test(label)) continue;
          if (!await closeButton.isEnabled()) continue;

          await closeButton.click();
          await closeButton.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
          if (!await closeButton.isVisible().catch(() => false)) {
            console.log('Advertisement watched and closed.');
            return 'closed';
          }
        }
      } catch {
        // Ad frames are frequently replaced during their countdown.
      }
    }
    await sleep(500);
  }

  console.warn(adSeen
    ? 'The advertisement appeared but has not finished yet; continuing to wait.'
    : `No advertisement appeared within ${config.adTimeoutMs / 1000} seconds; staying in this game.`);
  return adSeen ? 'seen' : 'not-seen';
}

class HeadlessRestartRequired extends Error {}

async function waitForCompletedAdvertisement(page, headless) {
  let consecutiveNoAdTimeouts = 0;

  while (true) {
    const result = await closeAdvertisement(page);
    if (result === 'closed') return;

    if (result === 'not-seen') {
      consecutiveNoAdTimeouts += 1;
      if (!headless && consecutiveNoAdTimeouts >= config.noAdHeadlessRestartCount) {
        throw new HeadlessRestartRequired();
      }
    } else {
      // An advertisement is present, so the missing-ad streak is over.
      consecutiveNoAdTimeouts = 0;
    }

    // Never leave the current game until an advertisement was really shown
    // and its close action succeeded.
    await sleep(1_000);
  }
}

async function playActualGame(page, iframe, frame) {
  await frame.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  const instructions = await readGameInstructions(frame);
  if (instructions) console.log(`Using game instructions: ${instructions.slice(0, 200)}`);
  const minMs = Math.min(config.minGamePlayMs, config.maxGamePlayMs);
  const maxMs = Math.max(config.minGamePlayMs, config.maxGamePlayMs);
  const playTimeMs = Math.round(randomBetween(minMs, maxMs));
  const deadline = Date.now() + playTimeMs;

  console.log(`Actual game opened. Auto-playing for about ${Math.round(playTimeMs / 60_000)} minutes...`);

  while (Date.now() < deadline) {
    if (await advanceCompletedLevel(page)) {
      await sleep(1_000);
      continue;
    }

    if (config.autoPlay) {
      await performGameAction(page, iframe, instructions).catch(() => {
        // Games can redraw or replace their iframe while an action is running.
      });
    }

    await sleep(Math.min(randomBetween(800, 1_800), Math.max(0, deadline - Date.now())));
  }

  if (!await advanceCompletedLevel(page)) {
    await skipOrRefreshLevel(page, iframe);
  }
  console.log('Game play time completed. Exiting this game...');
}

async function exitGame(page) {
  const exitButton = page.getByRole('button', { name: /exit game/i });
  if (await exitButton.isVisible().catch(() => false)) {
    await exitButton.click();
    console.log('Game closed.');
  }
}

async function runAutomation(headless) {
  const browser = await chromium.launch({
    headless,
    slowMo: config.slowMo,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Ads and game overlays sometimes open the same game in a new tab. Keep the
  // automation in the original page and close every popup as soon as it opens.
  context.on('page', (openedPage) => {
    if (openedPage === page) return;
    console.log('Blocked an extra game/ad tab.');
    void openedPage.close().catch(() => {});
  });

  try {
    let completed = 0;
    let previousGameHref;

    while (config.gameCount === 0 || completed < config.gameCount) {
      const games = targetGameUrls.map((href) => ({
        href,
        title: decodeURIComponent(new URL(href).pathname.split('/').pop())
          .replaceAll('-', ' '),
      }));

      const choices = games.filter((game) => game.href !== previousGameHref);
      const availableGames = choices.length ? choices : games;
      const game = availableGames[Math.floor(Math.random() * availableGames.length)];
      previousGameHref = game.href;

      console.log(`Selected: ${game.title}`);
      await page.goto(game.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });

      const { iframe, frame } = await startGame(page);
      await launchEmbeddedGame(page, iframe, frame);
      console.log('Waiting for the advertisement...');
      await waitForCompletedAdvertisement(page, headless);
      await playActualGame(page, iframe, frame);
      await exitGame(page);

      completed += 1;
      console.log(`Completed ad cycle ${completed}.`);
      if (config.gameCount === 0 || completed < config.gameCount) {
        await sleep(config.betweenGamesMs);
      }
    }

    console.log('Automation finished.');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  let headless = config.headless;

  while (true) {
    try {
      await runAutomation(headless);
      return;
    } catch (error) {
      if (!(error instanceof HeadlessRestartRequired) || headless) throw error;

      headless = true;
      console.warn(
        `No advertisement appeared ${config.noAdHeadlessRestartCount} times in a row. `
        + 'Restarting the browser with HEADLESS=true...',
      );
    }
  }
}

main().catch((error) => {
  console.error(`Automation failed: ${error.message}`);
  process.exitCode = 1;
});
