import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import './styles/game.css';

const host = document.getElementById('game-root');
if (!host) throw new Error('Missing #game-root');

// The game is authored for a 16:9 landscape viewport. FIT preserves its
// proportions on wider/narrower landscape phones instead of stretching it.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  backgroundColor: '#171315',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 1400 }, debug: false, fps: 60 },
  },
  input: { activePointers: 4 },
  render: { antialias: false, pixelArt: false, roundPixels: true, powerPreference: 'high-performance', batchSize: 4096, resolution: Math.min(window.devicePixelRatio || 1, 1.25) },
  scene: [GameScene],
});

// Portrait is intentionally unsupported: show a clear rotate-device screen
// rather than squeezing the landscape game into a tall viewport.
const orientationGate = document.createElement('section');
orientationGate.className = 'aoc-orientation-gate';
orientationGate.setAttribute('role', 'status');
orientationGate.setAttribute('aria-live', 'polite');

const orientationCard = document.createElement('div');
orientationCard.className = 'aoc-orientation-card';
const orientationIcon = document.createElement('div');
orientationIcon.className = 'aoc-orientation-icon';
orientationIcon.setAttribute('aria-hidden', 'true');
orientationIcon.textContent = '↻';
const orientationTitle = document.createElement('h1');
orientationTitle.textContent = 'گوشی را افقی کنید';
const orientationText = document.createElement('p');
orientationText.textContent = 'خاکستر تاج‌ها فقط در حالت افقی قابل بازی است.';
const orientationButton = document.createElement('button');
orientationButton.type = 'button';
orientationButton.textContent = 'تلاش برای قفل حالت افقی';
orientationCard.append(orientationIcon, orientationTitle, orientationText, orientationButton);
orientationGate.append(orientationCard);
document.body.append(orientationGate);

const portraitQuery = window.matchMedia('(orientation: portrait)');
const updateOrientationGate = () => {
  document.documentElement.classList.toggle('aoc-portrait-mode', portraitQuery.matches);
  orientationGate.setAttribute('aria-hidden', String(!portraitQuery.matches));
};
updateOrientationGate();
portraitQuery.addEventListener?.('change', updateOrientationGate);
window.addEventListener('resize', updateOrientationGate);
window.addEventListener('orientationchange', updateOrientationGate);

orientationButton.addEventListener('click', async () => {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> };
  try {
    await orientation.lock?.('landscape');
  } catch {
    // Most mobile browsers require a user gesture/fullscreen before allowing
    // orientation lock. The user can rotate the device manually instead.
  }
  updateOrientationGate();
});

window.addEventListener('beforeunload', () => {
  const scene = game.scene.getScene('GameScene') as GameScene | undefined;
  scene?.flushSaveBeforeExit();
  game.destroy(true);
});
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined));
}
