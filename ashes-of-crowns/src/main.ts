import Phaser from 'phaser';
import { GameScene } from './game/GameScene';
import './styles/game.css';

const host = document.getElementById('game-root');
if (!host) throw new Error('Missing #game-root');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  backgroundColor: '#171315',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 1400 }, debug: false, fps: 60 },
  },
  input: { activePointers: 4 },
  render: { antialias: true, pixelArt: false, roundPixels: true },
  scene: [GameScene],
});

window.addEventListener('beforeunload', () => {
  const scene = game.scene.getScene('GameScene') as GameScene | undefined;
  scene?.flushSaveBeforeExit();
  game.destroy(true);
});
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined));
}
