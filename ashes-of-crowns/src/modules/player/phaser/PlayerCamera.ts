import Phaser from 'phaser';

export interface PlayerCameraOptions {
  /** World bounds the camera is clamped to. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** Smoothing 0..1 (lower = smoother). Default 0.12 horizontal, 0.1 vertical. */
  lerpX?: number;
  lerpY?: number;
  /** Dead zone in pixels around the player. */
  deadZoneWidth?: number;
  deadZoneHeight?: number;
  /** Pixels the camera looks ahead in the facing direction. */
  lookAhead?: number;
  /** Vertical offset (negative = player drawn lower on screen). */
  offsetY?: number;
  zoom?: number;
}

/** Smooth side-scrolling follow camera with look-ahead, dead zone, bounds and screen shake. */
export class PlayerCamera {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  private opts: Required<Omit<PlayerCameraOptions, 'bounds'>> & { bounds?: PlayerCameraOptions['bounds'] };
  private lookX = 0;
  private followPoint: Phaser.GameObjects.Zone;

  constructor(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, options: PlayerCameraOptions = {}) {
    this.cam = scene.cameras.main;
    this.target = target;
    this.opts = {
      lerpX: 0.12,
      lerpY: 0.1,
      deadZoneWidth: 40,
      deadZoneHeight: 60,
      lookAhead: 60,
      offsetY: -40,
      zoom: 1,
      ...options,
    };
    // Follow an invisible point so look-ahead can be smoothed independently of the player.
    this.followPoint = scene.add.zone(target.x, target.y, 1, 1);
    this.cam.setZoom(this.opts.zoom);
    this.cam.startFollow(this.followPoint, true, this.opts.lerpX, this.opts.lerpY, 0, this.opts.offsetY);
    this.cam.setDeadzone(this.opts.deadZoneWidth, this.opts.deadZoneHeight);
    this.cam.setRoundPixels(true);
    if (this.opts.bounds) this.setBounds(this.opts.bounds);
  }

  setBounds(b: { x: number; y: number; width: number; height: number }): void {
    this.opts.bounds = b;
    this.cam.setBounds(b.x, b.y, b.width, b.height);
  }

  /** Call every frame with the player's facing and (optionally) speed. */
  update(dt: number, facing: 1 | -1, speedX = 0): void {
    const want = facing * this.opts.lookAhead * Math.min(1, Math.abs(speedX) / 200);
    // Frame-rate independent exponential smoothing.
    this.lookX += (want - this.lookX) * (1 - Math.exp(-4 * dt));
    this.followPoint.setPosition(this.target.x + this.lookX, this.target.y);
  }

  /** Instantly centre on the player (respawn / teleport). */
  snap(): void {
    this.lookX = 0;
    this.followPoint.setPosition(this.target.x, this.target.y);
    this.cam.centerOn(this.target.x, this.target.y + this.opts.offsetY * -1);
  }

  shake(duration = 150, intensity = 0.006): void {
    this.cam.shake(duration, intensity);
  }

  setZoom(z: number): void {
    this.opts.zoom = z;
    this.cam.setZoom(z);
  }

  destroy(): void {
    this.cam.stopFollow();
    this.followPoint.destroy();
  }
}
