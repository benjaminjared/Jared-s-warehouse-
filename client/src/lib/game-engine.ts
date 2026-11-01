/**
 * Game Engine for Jared's Warehouse Dash
 * Handles core mechanics, rendering, and state management via Canvas API
 */

import type { LotusCheckpoint } from "@shared/schema";
import warehouseRunBackground from "../assets/warehouse-run-background.png";
import jameosCookieSpriteUrl from "../assets/jameos-cookie.png";

const CUDA_CORE_WIDTH = 18;
const CUDA_CORE_HEIGHT = 20;
const JAMEO_COOKIE_DURATION_MS = 8_000;
const JAMEO_COOKIE_SPAWN_CHANCE = 0.007;
const JAMEO_COOKIE_SPEED_MULTIPLIER = 70;
const JAMEO_COOKIE_CORE_MULTIPLIER = 5_000;

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

export interface GameStats {
  score: number;
  cudaCores: number;
  distance: number;
  flopsCollected: number;
  rareCds: number;
  pcBuildFast: boolean;
  milestone: string;
}

interface EngineCallbacks {
  onStartRequested?: () => void;
  onGameOver: (stats: GameStats) => void;
  onReviveAvailable?: (useRevive: () => void, decline: () => void) => void;
  onShopOpen?: () => void;
  /** Fired ~5x/sec while playing (used for multiplayer race progress). */
  onProgress?: (distance: number, cudaCores: number) => void;
  /** Fired once when a race target distance is reached. */
  onRaceFinished?: (stats: GameStats) => void;
  /** Fired whenever a multiplayer racer loses one of their three lives. */
  onRaceLifeLost?: (distance: number, cudaCores: number, livesRemaining: number) => void;
  /** Forces a normal run into the mandatory PC assembly work order. */
  onPcBuildDrafted?: () => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;
  
  private animationFrameId: number = 0;
  private lastTime: number = 0;
  
  // Game State
  private state: GameState = 'START';
  private distance: number = 0;
  private cudaCores: number = 0;
  private score: number = 0;
  private speed: number = 7.5; // Base speed
  private baseSpeed: number = 7.5;
  
  // Physics & Player
  private player = {
    x: 100,
    y: 0,
    width: 40,
    height: 60,
    vy: 0,
    gravity: 0.6,
    jumpStrength: -14,
    isGrounded: false,
    color: '#ff0055', // Jared's shirt
    squishTimer: 0
  };
  private playerSkin = {
    color: '#dd0033',
    shadow: '#bb0028',
    accent: '#ff3366',
    animated: false,
  };
  
  // Environment
  private groundY: number;
  private entities: any[] = [];
  private readonly cudaCoreSprite = new Image();
  private readonly jameosCookieSprite = new Image();
  private readonly warehouseBackgroundSprite = new Image();
  private particles: any[] = [];
  
  // Powerups
  private magnetActive: boolean = false;
  private magnetTimer: number = 0;
  private boosterActive: boolean = false;
  private boosterTimer: number = 0;
  private megaBoostActive: boolean = false;
  private megaBoostTimer: number = 0;
  private scarletRushActive: boolean = false;
  private scarletRushTimer: number = 0;
  private jumpBoostActive: boolean = false;
  private jumpBoostTimer: number = 0;
  private jetSurgeActive: boolean = false;
  private jetSurgeTimer: number = 0;
  private supernovaActive: boolean = false;
  private supernovaTimer: number = 0;
  private jameoCookieTimer: number = 0;
  // Ghost booster (float mode + air dash)
  private ghostModeActive: boolean = false;
  private ghostAirDashActive: boolean = false;
  private ghostAirDashTimer: number = 0;
  private readonly GHOST_LOW_GRAVITY: number = 0.15;
  private readonly BASE_GRAVITY: number = 0.6;
  private teleportActive: boolean = false;
  private teleportFlashTimer: number = 0;
  public paused: boolean = false;

  public pause() { this.paused = true; }
  public resume() { this.paused = false; this.lastTime = performance.now(); }

  public exitGame() {
    this.paused = false;
    this.state = 'START';
    this.revivePending = false;
    this.stopAmbient();
    this.entities = [];
    this.particles = [];
    this.lotusCheckpoint = null;
    this.drawStartScreen();
  }

  public setDeveloperSpeedMultiplier(multiplier: number) {
    this.developerSpeedMultiplier = Math.max(0.5, Math.min(10, multiplier));
  }

  public setDeveloperInvincible(enabled: boolean) {
    this.developerInvincible = enabled;
  }

  public spawnInFront(type: 'booster' | 'supernova' | 'megaboost' | 'jetsurge' | 'magnet' | 'jumpboost' | 'scarletrush' | 'cookie' | 'cores' | 'flop') {
    const targetX = this.player.x + 120;
    if (type === 'cookie') {
      const size = 52;
      this.entities.push({
        type: 'jameo-cookie',
        x: targetX,
        y: this.groundY - size,
        w: size,
        h: size,
      });
      this.createParticles(targetX, this.groundY - 30, '#ffaa00', 12);
      return;
    }
    if (type === 'cores') {
      for (let i = 0; i < 14; i++) {
        this.entities.push({
          type: 'cuda',
          x: targetX + i * 26,
          y: this.groundY - 40 - Math.sin(i * 0.5) * 20,
          w: CUDA_CORE_WIDTH,
          h: CUDA_CORE_HEIGHT,
          sparkleTimer: Math.random() * 60,
        });
      }
      this.createParticles(targetX, this.groundY - 30, '#00ffcc', 15);
      return;
    }
    if (type === 'flop') {
      this.entities.push({
        type: 'flop',
        x: targetX,
        y: this.groundY - 45,
        w: 18,
        h: 18,
      });
      this.createParticles(targetX, this.groundY - 45, '#aa00ff', 8);
      return;
    }

    this.entities.push({
      type: 'powerup',
      powerType: type,
      x: targetX,
      y: this.groundY - 45,
      w: 24,
      h: 24,
    });
    this.createParticles(targetX, this.groundY - 45, '#ffff00', 10);
  }

  public nukeObstacles(): number {
    let count = 0;
    for (const ent of this.entities) {
      if (ent.type === 'obstacle') {
        this.createParticles(ent.x + (ent.w || 30) / 2, ent.y + (ent.h || 30) / 2, '#ff3333', 10);
        this.createParticles(ent.x + (ent.w || 30) / 2, ent.y + (ent.h || 30) / 2, '#ffffaa', 6);
        count++;
      }
    }
    this.entities = this.entities.filter(ent => ent.type !== 'obstacle');
    this.triggerScreenShake(12, 350);
    return count;
  }

  public setPlayerSkin(color: string, accent: string, animated: boolean = false, skinId: string = 'default') {
    this.playerSkin = {
      color,
      shadow: animated ? '#000000' : `${color}bb`,
      accent,
      animated,
      id: skinId,
    };
  }

  // Rare CD collectible (given to Runbun for a secret unlock)
  private rareCdsCollected: number = 0;
  /** CDs already handed to a game-over callback; prevents double-crediting after a Lotus respawn. */
  private rareCdsReported: number = 0;
  private nextRareCdFrame: number = 0;

  // Multiplayer race
  private raceTargetDistance: number | null = null;
  private raceMode = false;
  private raceFinished: boolean = false;
  private raceLivesRemaining: number = 0;
  private progressAccumulator: number = 0;

  public getLiveStats(): GameStats {
    return { ...this.buildStats(), cudaCores: Math.floor(this.cudaCores), rareCds: this.rareCdsCollected };
  }

  private buildStats(): GameStats {
    return {
      score: this.score,
      cudaCores: this.cudaCores,
      distance: Math.floor(this.distance),
      flopsCollected: Math.max(0, Math.floor(this.flopsCollected)),
      rareCds: Math.max(0, this.rareCdsCollected - this.rareCdsReported),
      pcBuildFast: this.pcBuildFast,
      milestone: this.getMilestoneString(this.cudaCores)
    };
  }

  // Revive mechanic
  private revivesAvailable: number = 0;
  private revivePending: boolean = false;
  private reviveInvincTimer: number = 0;
  private lotusCheckpoint: LotusCheckpoint | null = null;
  private developerSpeedMultiplier: number = 1;
  private developerInvincible: boolean = false;

  // Run modifiers from shop items
  private luckyCharmActive: boolean = false;
  private headStartActive: boolean = false;
  private overclockActive: boolean = false;
  private hardDriveSpeedBonus: number = 0;
  private coreMultiplier: number = 1;
  private pcBuildEnabled: boolean = true;
  private pcBuildDrafted: boolean = false;
  private pcBuildTriggerFrame: number = 0;
  private pcBuildCoreBonusTimer: number = 0;
  private pcBuildSlowTimer: number = 0;
  private pcBuildFast: boolean = false;

  public resolvePcBuild(success: boolean, elapsedSeconds: number) {
    if (success) {
      this.pcBuildCoreBonusTimer = 60_000;
      if (elapsedSeconds < 55) this.pcBuildFast = true;
    } else {
      this.pcBuildSlowTimer = 60_000;
    }
    this.resume();
  }

  // Silicon Lottery
  private static readonly LOTTERY_SLOTS = [
    { type: 'magnet',      label: 'MAGNET',    color: '#ff2244' },
    { type: 'booster',     label: 'BOOSTER',   color: '#ff7700' },
    { type: 'megaboost',   label: 'MEGA 50×',  color: '#00cc44' },
    { type: 'jumpboost',   label: 'JUMP+',     color: '#dd00ff' },
    { type: 'scarletrush', label: 'RUSH 75×',  color: '#aa00cc' },
    { type: 'jetsurge',    label: 'JET SURGE', color: '#ff5500' },
    { type: 'supernova',   label: 'NOVA 250×', color: '#ffcc00' },
    { type: 'teleport',    label: 'WARP',      color: '#00ffff' },
  ];
  private siliconLotteryState: 'idle' | 'entrance' | 'spinning' | 'result' = 'idle';
  private siliconLotteryEntranceFrame: number = 0;
  private siliconLoteryCpuY: number = -100;
  private siliconLotteryWheelAngle: number = 0;
  private siliconLotterySpinFrame: number = 0;
  private siliconLotterySpinTotal: number = 300;
  private siliconLotteryFinalAngle: number = 0;
  private siliconLotteryResult: number = 0;
  private siliconLotteryResultTimer: number = 0;

  // Nits (permanent flop multiplier collectables)
  private flopsCollected: number = 0;

  // Spawning controls
  private frameCount: number = 0;
  private nextObstacleFrame: number = 60;
  private nextCudaFrame: number = 20;
  private nextFlopFrame: number = 80;

  // Audio Context (Lazy loaded)
  private audioCtx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private ambientRunning: boolean = false;

  // Screen shake
  private screenShakeTimer: number = 0;
  private screenShakeMag: number = 0;

  // Chromatic aberration flash
  private chromaTimer: number = 0;
  private chromaIntensity: number = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.cudaCoreSprite.src = "/cuda-core.png";
    this.jameosCookieSprite.src = jameosCookieSpriteUrl;
    this.warehouseBackgroundSprite.src = warehouseRunBackground;
    
    // Disable smoothing for pixel art look
    this.ctx.imageSmoothingEnabled = false;
    
    this.groundY = this.canvas.height - 80;
    this.player.y = this.groundY - this.player.height;
    
    this.bindEvents();
    this.drawStartScreen();
  }

  private bindEvents() {
    const handleInput = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).code !== 'Space') return;
      // Let focused controls handle Space themselves (including quest/rank retry controls).
      if (e.type === 'keydown' && (e.target as HTMLElement)?.closest?.('input, textarea, button, select, summary, [role="button"], [contenteditable="true"]')) return;
      if (e.type === 'keydown') e.preventDefault(); // Prevent scrolling
      
      if (this.state === 'START') {
        this.callbacks.onStartRequested?.();
      } else if (this.state === 'PLAYING') {
        this.jump();
      }
    };

    window.addEventListener('keydown', handleInput);
    this.canvas.addEventListener('mousedown', handleInput);
    this.canvas.addEventListener('touchstart', handleInput, { passive: false });
    
    // Cleanup helper attached to the instance
    this.destroy = () => {
      window.removeEventListener('keydown', handleInput);
      this.canvas.removeEventListener('mousedown', handleInput);
      this.canvas.removeEventListener('touchstart', handleInput);
      cancelAnimationFrame(this.animationFrameId);
    };
  }

  public destroy: () => void = () => {};

  public startGame(opts?: { revives?: number; hasHeadStart?: boolean; hasOverclock?: boolean; luckyCharm?: boolean; hasSprint?: boolean; coreDoubler?: boolean; hardDriveTier?: number; hasGhost?: boolean; lotusCheckpoint?: LotusCheckpoint | null; raceTargetDistance?: number | null; raceMode?: boolean; pcBuildEnabled?: boolean }) {
    this.paused = false;
    this.lastTime = performance.now();
    this.state = 'PLAYING';
    this.rareCdsCollected = 0;
    this.rareCdsReported = 0;
    this.nextRareCdFrame = 900 + Math.random() * 900;
    this.raceTargetDistance = opts?.raceTargetDistance ?? null;
    this.raceMode = opts?.raceMode ?? this.raceTargetDistance !== null;
    this.raceFinished = false;
    this.raceLivesRemaining = this.raceMode ? 3 : 0;
    this.progressAccumulator = 0;
    this.distance = 0;
    this.cudaCores = 0;
    this.score = 0;
    this.speed = this.baseSpeed;
    this.entities = [];
    this.particles = [];
    this.magnetActive = false; this.magnetTimer = 0;
    this.boosterActive = false; this.boosterTimer = 0;
    this.megaBoostActive = false; this.megaBoostTimer = 0;
    this.scarletRushActive = false; this.scarletRushTimer = 0;
    this.jumpBoostActive = false; this.jumpBoostTimer = 0;
    this.jetSurgeActive = false; this.jetSurgeTimer = 0;
    this.supernovaActive = false; this.supernovaTimer = 0;
    this.jameoCookieTimer = 0;
    this.revivesAvailable = opts?.revives ?? 0;
    this.revivePending = false;
    this.reviveInvincTimer = 0;
    this.lotusCheckpoint = opts?.lotusCheckpoint ?? null;
    this.luckyCharmActive = opts?.luckyCharm ?? false;
    this.headStartActive = opts?.hasHeadStart ?? false;
    this.overclockActive = opts?.hasOverclock ?? false;
    this.coreMultiplier = opts?.coreDoubler ? 2 : 1;
    this.pcBuildEnabled = opts?.pcBuildEnabled ?? true;
    this.pcBuildDrafted = false;
    this.pcBuildTriggerFrame = 1_800 + Math.floor(Math.random() * 2_700);
    this.pcBuildCoreBonusTimer = 0;
    this.pcBuildSlowTimer = 0;
    this.pcBuildFast = false;
    const hdTier = opts?.hardDriveTier ?? 0;
    const HD_BONUSES: Record<number, number> = { 1: 0.08, 2: 0.16, 3: 0.25, 4: 0.35, 5: 0.50, 6: 0.70 };
    this.hardDriveSpeedBonus = HD_BONUSES[hdTier] ?? 0;
    // Ghost mode
    this.ghostModeActive = opts?.hasGhost ?? false;
    this.ghostAirDashActive = false;
    this.ghostAirDashTimer = 0;
    this.player.gravity = this.BASE_GRAVITY;
    // Apply shop item head starts
    if (this.headStartActive) { this.boosterActive = true; this.boosterTimer = 8000; }
    if (this.overclockActive) { this.jetSurgeActive = true; this.jetSurgeTimer = 10000; }
    if (opts?.hasSprint) { this.scarletRushActive = true; this.scarletRushTimer = 8000; }
    this.player.y = this.groundY - this.player.height;
    this.player.isGrounded = false;
    this.player.squishTimer = 0;
    this.player.vy = 0;
    this.frameCount = 0;
    this.nextObstacleFrame = 10;
    this.nextCudaFrame = 20;
    this.nextFlopFrame = 80;
    this.flopsCollected = 0;
    this.siliconLotteryState = 'idle';
    this.siliconLotteryEntranceFrame = 0;
    this.siliconLoteryCpuY = -100;
    this.siliconLotteryWheelAngle = 0;
    this.siliconLotterySpinFrame = 0;
    this.siliconLotteryFinalAngle = 0;
    this.siliconLotteryResult = 0;
    this.siliconLotteryResultTimer = 0;
    this.teleportActive = false;
    this.teleportFlashTimer = 0;
    this.screenShakeTimer = 0;
    this.screenShakeMag = 0;
    this.chromaTimer = 0;
    this.chromaIntensity = 0;
    this.lastTime = performance.now();
    this.startAmbient();
    this.loop(this.lastTime);
  }

  public captureLotusCheckpoint(): LotusCheckpoint {
    return {
      distance: Math.max(0, this.distance),
      cudaCores: Math.max(0, Math.floor(this.cudaCores)),
      score: Math.max(0, Math.floor(this.score)),
      flopsCollected: Math.max(0, Math.floor(this.flopsCollected)),
    };
  }

  public getLotusCheckpoint(): LotusCheckpoint | null {
    return this.lotusCheckpoint;
  }

  public setLotusCheckpoint(checkpoint: LotusCheckpoint | null) {
    this.lotusCheckpoint = checkpoint;
    this.render();
  }

  public respawnAtLotus(checkpoint: LotusCheckpoint) {
    const wasPlaying = this.state === 'PLAYING';
    this.lotusCheckpoint = null;
    this.state = 'PLAYING';
    this.paused = false;
    this.distance = checkpoint.distance;
    this.cudaCores = checkpoint.cudaCores;
    this.score = checkpoint.score;
    this.flopsCollected = checkpoint.flopsCollected;
    this.speed = this.baseSpeed;
    this.entities = [];
    this.particles = [];
    this.revivePending = false;
    this.reviveInvincTimer = 3000;
    this.player.y = this.groundY - this.player.height;
    this.player.vy = 0;
    this.player.isGrounded = true;
    this.frameCount = 0;
    this.nextObstacleFrame = 30;
    this.nextCudaFrame = 40;
    this.nextFlopFrame = 100;
    this.nextRareCdFrame = 900 + Math.random() * 900;
    this.lastTime = performance.now();
    this.startAmbient();
    this.render();
    if (!wasPlaying) this.loop(this.lastTime);
  }

  private jump() {
    if (this.player.isGrounded) {
      this.player.vy = this.player.jumpStrength;
      this.player.isGrounded = false;
      this.createParticles(this.player.x + 20, this.player.y + 60, '#ffffff', 5);
      this.createParticles(this.player.x + 20, this.player.y + 60, '#aaddff', 3);
      this.playJumpSound();
      // When ghost is active and player just jumped, switch to float gravity
      if (this.ghostModeActive) {
        this.ghostAirDashActive = false;
        this.player.gravity = this.GHOST_LOW_GRAVITY;
      }
    } else if (this.ghostModeActive && !this.ghostAirDashActive) {
      // Ghost air dash — snap gravity back, burst forward
      this.ghostAirDashActive = true;
      this.ghostAirDashTimer = 700;
      this.player.gravity = this.BASE_GRAVITY;
      // Slight downward push to make the dash feel snappy
      this.player.vy = Math.max(this.player.vy + 2, 2);
      this.createParticles(this.player.x - 10, this.player.y + 30, '#aaffee', 6);
      this.createParticles(this.player.x - 10, this.player.y + 30, '#ffffff', 4);
      this.createParticles(this.player.x - 10, this.player.y + 15, '#55ffcc', 4);
      // Speed burst handled in physics loop
    }
  }

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioCtx;
  }

  private playSound(type: 'death' | 'powerup' | 'megaboost') {
    try {
      const ctx = this.getAudioCtx();
      const now = ctx.currentTime;

      if (type === 'death') {
        // Realistic crash: burst of noise + low thud
        const bufSize = ctx.sampleRate * 0.6;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hiPass = ctx.createBiquadFilter();
        hiPass.type = 'bandpass';
        hiPass.frequency.value = 120;
        hiPass.Q.value = 0.5;
        const crashGain = ctx.createGain();
        crashGain.gain.setValueAtTime(0.35, now);
        crashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        src.connect(hiPass);
        hiPass.connect(crashGain);
        crashGain.connect(ctx.destination);
        src.start(now);

        // Low thud
        const thud = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(90, now);
        thud.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        thudGain.gain.setValueAtTime(0.4, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        thud.connect(thudGain);
        thudGain.connect(ctx.destination);
        thud.start(now);
        thud.stop(now + 0.25);

      } else if (type === 'powerup') {
        // Bright ping with a shimmer tail
        const freqs = [523, 659, 784, 1047];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          const t = now + i * 0.06;
          g.gain.setValueAtTime(0.0, t);
          g.gain.linearRampToValueAtTime(0.12, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          o.connect(g); g.connect(ctx.destination);
          o.start(t); o.stop(t + 0.25);
        });

      } else if (type === 'megaboost') {
        // Big whooshing power surge
        const bufSize = ctx.sampleRate * 0.5;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(200, now);
        lowpass.frequency.exponentialRampToValueAtTime(3000, now + 0.4);
        const surgeGain = ctx.createGain();
        surgeGain.gain.setValueAtTime(0.22, now);
        surgeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        src.connect(lowpass); lowpass.connect(surgeGain); surgeGain.connect(ctx.destination);
        src.start(now);

        const tone = ctx.createOscillator();
        const toneGain = ctx.createGain();
        tone.type = 'sawtooth';
        tone.frequency.setValueAtTime(180, now);
        tone.frequency.exponentialRampToValueAtTime(900, now + 0.4);
        toneGain.gain.setValueAtTime(0.1, now);
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        tone.connect(toneGain); toneGain.connect(ctx.destination);
        tone.start(now); tone.stop(now + 0.4);
      }
    } catch (e) {
      console.warn("Audio failed", e);
    }
  }

  private playCudaSound() {
    try {
      const ctx = this.getAudioCtx();
      const now = ctx.currentTime;
      // Soft high 'tink'
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800, now);
      o.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.1);
    } catch (_) {}
  }

  private playJumpSound() {
    try {
      const ctx = this.getAudioCtx();
      const now = ctx.currentTime;
      // Quick airy whoosh using noise
      const bufSize = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = 'highpass';
      hiPass.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(hiPass); hiPass.connect(g); g.connect(ctx.destination);
      src.start(now);
    } catch (_) {}
  }

  private playFlopSound() {
    try {
      const ctx = this.getAudioCtx();
      const now = ctx.currentTime;
      // Deep purple 'zap'
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(60, now);
      o.frequency.exponentialRampToValueAtTime(400, now + 0.15);
      g.gain.setValueAtTime(0.13, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.2);
    } catch (_) {}
  }

  private startAmbient() {
    try {
      const ctx = this.getAudioCtx();
      if (this.ambientRunning) return;
      this.ambientRunning = true;

      // Master gain — very quiet
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.028;
      masterGain.connect(ctx.destination);
      this.ambientGain = masterGain;

      // Low drone pair (warehouse hum / AC unit)
      const makeHumOsc = (freq: number, type: OscillatorType, gain: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = gain;
        o.connect(g); g.connect(masterGain);
        o.start();
        return o;
      };
      makeHumOsc(60, 'sine', 1.0);   // fundamental hum
      makeHumOsc(63, 'sine', 0.4);   // beating / breathing
      makeHumOsc(120, 'sine', 0.15); // harmonic
      makeHumOsc(180, 'sine', 0.06); // subtle overtone

      // Filtered brown noise for distant machinery
      const bufSize = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = last = (last + 0.02 * white) / 1.02; // brown noise
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buf;
      noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 180;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.5;
      noiseSrc.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(masterGain);
      noiseSrc.start();
    } catch (e) {
      console.warn("Ambient audio failed", e);
    }
  }

  private stopAmbient() {
    try {
      if (this.ambientGain) {
        const ctx = this.getAudioCtx();
        this.ambientGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      }
      this.ambientRunning = false;
    } catch (_) {}
  }

  private triggerScreenShake(magnitude: number, durationMs: number) {
    this.screenShakeMag = magnitude;
    this.screenShakeTimer = durationMs;
  }

  private loop = (time: number) => {
    if (this.state !== 'PLAYING') return;
    
    const deltaTime = time - this.lastTime;
    this.lastTime = time;
    
    if (!this.paused) {
      this.update(deltaTime);
    }
    this.render();
    
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.frameCount++;

    // Silicon Lottery — always update, freeze game world when active
    this.updateSiliconLottery();
    if (this.siliconLotteryState !== 'idle') return;

    if (this.jameoCookieTimer > 0) {
      this.jameoCookieTimer = Math.max(0, this.jameoCookieTimer - dt);
    }
    
    // Time-based speed increase (Hard Drive applies a permanent speed multiplier)
    this.baseSpeed = (7.5 + (this.distance / 1800)) * (1 + this.hardDriveSpeedBonus);
    
    let speedMult = 1.0;
    if (this.jetSurgeActive) speedMult = 4.0;
    else if (this.supernovaActive) speedMult = 3.0;
    else if (this.scarletRushActive) speedMult = 2.0;
    else if (this.boosterActive) speedMult = 1.6;
    if (this.ghostAirDashActive) speedMult *= 1.4;
    if (this.jameoCookieTimer > 0) speedMult = JAMEO_COOKIE_SPEED_MULTIPLIER;
    
    this.speed = this.baseSpeed * speedMult * this.developerSpeedMultiplier;
    if (this.pcBuildSlowTimer > 0 && this.jameoCookieTimer <= 0) this.speed *= 0.5;
    
    this.distance += this.speed / 10;
    
    this.score = Math.floor(this.distance * 10) + this.cudaCores;

    if (this.callbacks.onProgress) {
      this.progressAccumulator += dt;
      if (this.progressAccumulator >= 200) {
        this.progressAccumulator = 0;
        this.callbacks.onProgress(Math.floor(this.distance), Math.floor(this.cudaCores));
      }
    }

    if (this.raceMode && this.raceTargetDistance !== null && !this.raceFinished && this.distance >= this.raceTargetDistance) {
      this.raceFinished = true;
      this.state = 'GAMEOVER';
      this.stopAmbient();
      this.createParticles(this.player.x + 20, this.player.y + 30, '#ffd34d', 40);
      this.callbacks.onRaceFinished?.(this.buildStats());
      return;
    }

    if (this.pcBuildEnabled && !this.pcBuildDrafted && this.frameCount >= this.pcBuildTriggerFrame &&
        this.siliconLotteryState === 'idle' && !this.revivePending) {
      this.pcBuildDrafted = true;
      this.pause();
      this.callbacks.onPcBuildDrafted?.();
      return;
    }

    if (this.pcBuildCoreBonusTimer > 0) this.pcBuildCoreBonusTimer = Math.max(0, this.pcBuildCoreBonusTimer - dt);
    if (this.pcBuildSlowTimer > 0) this.pcBuildSlowTimer = Math.max(0, this.pcBuildSlowTimer - dt);
    if (this.reviveInvincTimer > 0) this.reviveInvincTimer = Math.max(0, this.reviveInvincTimer - dt);

    // Powerup Timers
    const updateTimer = (active: boolean, timer: number, delta: number) => {
      if (!active) return { active, timer };
      timer -= delta;
      if (timer <= 0) return { active: false, timer: 0 };
      return { active, timer };
    };

    // Particles/Trail
    if (this.frameCount % 2 === 0) {
      this.particles.push({
        x: this.player.x,
        y: this.player.y + this.player.height / 2,
        vx: -this.speed * 0.5,
        vy: (Math.random() - 0.5) * 2,
        size: 2,
        color: 'rgba(255, 255, 255, 0.3)',
        life: 0.5
      });
    }

    if (this.jetSurgeActive && this.frameCount % 2 === 0) {
      this.createParticles(this.player.x, this.player.y + this.player.height, '#ff4400', 2); // Fire
    }

    // Ghost float particles
    if (this.ghostModeActive && !this.player.isGrounded && this.frameCount % 3 === 0) {
      this.createParticles(this.player.x + 20, this.player.y + this.player.height, '#aaffee', 1);
      this.createParticles(this.player.x + 20, this.player.y + 20, '#55ffcc', 1);
    }
    
    if (this.supernovaActive && this.frameCount % 2 === 0) {
      this.createParticles(this.player.x, this.player.y + 30, '#ffffff', 1); // Star/Nebula
      this.createParticles(this.player.x, this.player.y + 30, '#ff00ff', 1);
    }

    const mag = updateTimer(this.magnetActive, this.magnetTimer, dt);
    this.magnetActive = mag.active; this.magnetTimer = mag.timer;

    const boo = updateTimer(this.boosterActive, this.boosterTimer, dt);
    this.boosterActive = boo.active; this.boosterTimer = boo.timer;

    const meg = updateTimer(this.megaBoostActive, this.megaBoostTimer, dt);
    this.megaBoostActive = meg.active; this.megaBoostTimer = meg.timer;

    const sca = updateTimer(this.scarletRushActive, this.scarletRushTimer, dt);
    this.scarletRushActive = sca.active; this.scarletRushTimer = sca.timer;

    const jmp = updateTimer(this.jumpBoostActive, this.jumpBoostTimer, dt);
    this.jumpBoostActive = jmp.active; this.jumpBoostTimer = jmp.timer;

    const jet = updateTimer(this.jetSurgeActive, this.jetSurgeTimer, dt);
    this.jetSurgeActive = jet.active; this.jetSurgeTimer = jet.timer;

    const sup = updateTimer(this.supernovaActive, this.supernovaTimer, dt);
    this.supernovaActive = sup.active; this.supernovaTimer = sup.timer;

    // Ghost air dash timer
    if (this.ghostAirDashActive) {
      this.ghostAirDashTimer -= dt;
      if (this.ghostAirDashTimer <= 0) {
        this.ghostAirDashActive = false;
        // If still airborne, restore float gravity; if grounded, handled on landing
        if (!this.player.isGrounded) this.player.gravity = this.GHOST_LOW_GRAVITY;
      }
    }

    // Jump Strength (with squish effect)
    this.player.jumpStrength = this.jumpBoostActive ? -20 : -14;

    // Player Physics
    this.player.vy += this.player.gravity;
    this.player.y += this.player.vy;
    
    let onPlatform = false;
    for (const ent of this.entities) {
      if (this.jameoCookieTimer <= 0 && ent.type === 'platform') {
        if (this.player.vy >= 0 && 
            this.player.x + this.player.width > ent.x && 
            this.player.x < ent.x + ent.w &&
            this.player.y + this.player.height >= ent.y &&
            this.player.y + this.player.height <= ent.y + 10) {
          
          if (!this.player.isGrounded) {
             // Landing squish
             this.player.squishTimer = 6; 
          }
          
          this.player.y = ent.y - this.player.height;
          this.player.vy = 0;
          onPlatform = true;
          break;
        }
      }
    }

    if (onPlatform || this.player.y >= this.groundY - this.player.height) {
      if (!onPlatform) {
        if (!this.player.isGrounded) this.player.squishTimer = 6;
        this.player.y = this.groundY - this.player.height;
      }
      this.player.vy = 0;
      this.player.isGrounded = true;
      // Ghost: on landing, end any air dash and restore normal gravity (floatiness only in air)
      if (this.ghostModeActive) {
        this.ghostAirDashActive = false;
        this.ghostAirDashTimer = 0;
        this.player.gravity = this.BASE_GRAVITY;
      }
    } else {
      this.player.isGrounded = false;
    }

    if (this.player.squishTimer > 0) this.player.squishTimer--;

    // Spawning Logic
    if (this.frameCount >= this.nextObstacleFrame) {
      // 40% chance of a platform section
      if (Math.random() < 0.4) {
        this.spawnPlatformSection();
      } else {
        this.spawnObstacle();
      }

      // One 0.7% cookie roll per obstacle-spawn window; keep only one in play.
      const cookieAlreadyInPlay = this.entities.some((entity) => entity.type === 'jameo-cookie');
      if (this.jameoCookieTimer <= 0 && !cookieAlreadyInPlay && Math.random() < JAMEO_COOKIE_SPAWN_CHANCE) {
        this.spawnJameoCookie();
      }
      
      // Meteor Shower Logic (Random chance while playing)
      if (Math.random() < 0.005) {
        this.triggerMeteorShower();
      }
      
      // Distance between obstacles decreases as speed increases, but has a minimum
      this.nextObstacleFrame = this.frameCount + Math.max(40, 100 - (this.speed * 2) + Math.random() * 60);
    }

    if (this.frameCount >= this.nextCudaFrame) {
      this.spawnCudaBatch();
      this.nextCudaFrame = this.frameCount + 15 + Math.random() * 20;
    }

    // Nit spawning (not too rare - roughly every 60-120 frames)
    if (this.frameCount >= this.nextFlopFrame) {
      this.spawnFlop();
      this.nextFlopFrame = this.frameCount + 60 + Math.random() * 60;
    }

    // Rare CD: a genuinely rare drop. Each check window has a small chance to spawn one.
    if (this.frameCount >= this.nextRareCdFrame) {
      if (Math.random() < 0.12) this.spawnRareCd();
      this.nextRareCdFrame = this.frameCount + 700 + Math.random() * 900;
    }

    // Teleport flash decay
    if (this.teleportFlashTimer > 0) {
      this.teleportFlashTimer -= dt;
    }

    // Screen shake decay
    if (this.screenShakeTimer > 0) this.screenShakeTimer -= dt;

    // Chromatic aberration decay
    if (this.chromaTimer > 0) this.chromaTimer -= dt;

    // Landing shake
    if (this.player.squishTimer === 6) {
      this.triggerScreenShake(5, 160);
    }

    // Occasionally spawn powerups
    const roll = Math.random();
    if (roll < 0.001) this.spawnPowerUp('magnet');
    else if (roll < 0.002) this.spawnPowerUp('booster');
    else if (roll < 0.0022) this.spawnPowerUp('megaboost');
    else if (roll < 0.00225) this.spawnPowerUp('scarletrush');
    else if (roll < 0.0024) this.spawnPowerUp('jumpboost');
    else if (roll < 0.0025) this.spawnPowerUp('jetsurge');
    else if (roll < 0.00251) this.spawnPowerUp('supernova');
    else if (roll < 0.00260) this.spawnPowerUp('teleport');

    // Entity Updates & Collisions
    let didTeleport = false;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const ent = this.entities[i];
      const previousEntityX = ent.x;
      ent.x -= this.speed;

      // Magnet attraction for flops
      if (this.magnetActive && ent.type === 'cuda') {
        const dx = (this.player.x + 20) - ent.x;
        const dy = (this.player.y + 30) - ent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 300) {
          ent.x += (dx / dist) * 10;
          ent.y += (dy / dist) * 10;
        }
      }

      // Sweep fast-moving entities so the cookie's high-speed run can still collect items.
      const sweepEnabled = this.jameoCookieTimer > 0 || ent.type === 'jameo-cookie';
      const sweptLeft = Math.min(previousEntityX, ent.x);
      const sweptRight = Math.max(previousEntityX, ent.x) + ent.w;
      const sweptCollision = sweepEnabled &&
        this.player.x < sweptRight &&
        this.player.x + this.player.width > sweptLeft &&
        this.player.y < ent.y + ent.h &&
        this.player.y + this.player.height > ent.y;

      // Check collision
      if (this.checkCollision(this.player, ent) || sweptCollision) {
        if (ent.type === 'jameo-cookie') {
          this.jameoCookieTimer = JAMEO_COOKIE_DURATION_MS;
          this.createParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#ff8a24', 28);
          this.createParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#ffe36a', 18);
          this.playSound('megaboost');
          this.triggerScreenShake(5, 180);
          this.entities.splice(i, 1);
          continue;
        } else if (ent.type === 'obstacle') {
          if (this.jameoCookieTimer > 0) {
            this.createParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#ff8a24', 12);
            this.entities.splice(i, 1);
            continue;
          }
          if (this.reviveInvincTimer > 0) {
            this.entities.splice(i, 1);
            continue;
          }
          if (this.developerInvincible) {
            this.createParticles(ent.x + ent.w / 2, ent.y + ent.h / 2, '#55ffcc', 8);
            this.entities.splice(i, 1);
            continue;
          }
          if (this.jetSurgeActive) {
            this.jetSurgeActive = false;
            this.jetSurgeTimer = 0;
            this.createParticles(ent.x + ent.w/2, ent.y + ent.h/2, '#ff8800', 20);
            this.entities.splice(i, 1);
            continue;
          }
          this.playSound('death');
          this.gameOver();
          return; // Stop updating
        } else if (ent.type === 'cuda') {
          // Blue particle shooting up on flop collection
          this.createParticles(ent.x, ent.y, '#0088ff', 5);
          this.playCudaSound();
          
          // CUDA core value scales exponentially, boosted by flop multiplier
          const nitMult2 = 1.0 + this.flopsCollected * 0.09;
          const luckyMult = this.luckyCharmActive ? 1.25 : 1.0;
          const pcBuildCoreMultiplier = this.pcBuildCoreBonusTimer > 0 ? 2 : 1;
          let flopValue = Math.floor((1 + Math.pow(this.distance / 100, 1.8)) * nitMult2 * luckyMult * this.coreMultiplier * pcBuildCoreMultiplier);
          if (this.supernovaActive) flopValue *= 250;
          else if (this.scarletRushActive) flopValue *= 75;
          else if (this.megaBoostActive) flopValue *= 50;
          if (this.jameoCookieTimer > 0) flopValue *= JAMEO_COOKIE_CORE_MULTIPLIER;
          this.cudaCores += this.boosterActive && !this.megaBoostActive && !this.scarletRushActive && !this.supernovaActive ? flopValue * 2 : flopValue;
          this.createParticles(ent.x, ent.y, '#00ffcc', 3);
          this.entities.splice(i, 1);
          continue;
        } else if (ent.type === 'rarecd') {
          this.rareCdsCollected++;
          this.createParticles(ent.x + 12, ent.y + 12, '#ffffff', 18);
          this.createParticles(ent.x + 12, ent.y + 12, '#ff2a2a', 14);
          this.createParticles(ent.x + 12, ent.y + 12, '#8ff4ff', 14);
          this.playSound('megaboost');
          this.triggerScreenShake(6, 200);
          this.entities.splice(i, 1);
          continue;
        } else if (ent.type === 'flop') {
          // Nit collected: permanent +0.09x flop multiplier
          this.flopsCollected++;
          this.createParticles(ent.x, ent.y, '#aa00ff', 8);
          this.createParticles(ent.x, ent.y, '#000000', 5);
          this.playFlopSound();
          this.triggerScreenShake(4, 120);
          this.entities.splice(i, 1);
          continue;
        } else if (ent.type === 'powerup') {
          if (ent.powerType === 'magnet') {
            this.magnetActive = true;
            this.magnetTimer = 5000; // 5 seconds
            this.playSound('powerup');
          } else if (ent.powerType === 'booster') {
            this.boosterActive = true;
            this.boosterTimer = 8000; // 8 seconds
            this.playSound('powerup');
          } else if (ent.powerType === 'megaboost') {
            this.megaBoostActive = true;
            this.megaBoostTimer = 10000; // 10 seconds
            this.playSound('megaboost');
          } else if (ent.powerType === 'scarletrush') {
            this.scarletRushActive = true;
            this.scarletRushTimer = 4000; // 4 seconds
            this.playSound('megaboost');
          } else if (ent.powerType === 'jumpboost') {
            this.jumpBoostActive = true;
            this.jumpBoostTimer = 17000; // 17 seconds
            this.playSound('powerup');
          } else if (ent.powerType === 'jetsurge') {
            this.jetSurgeActive = true;
            this.jetSurgeTimer = 10000; // 10 seconds
            this.playSound('megaboost');
          } else if (ent.powerType === 'supernova') {
            this.supernovaActive = true;
            this.supernovaTimer = 10000; // 10 seconds
            this.playSound('megaboost');
          } else if (ent.powerType === 'teleport') {
            // Teleport: skip Jared 400m forward, clear all entities
            didTeleport = true;
            this.distance += 400;
            this.teleportFlashTimer = 300;
            this.createParticles(this.player.x + 20, this.player.y + 30, '#00ffff', 30);
            this.createParticles(this.player.x + 20, this.player.y + 30, '#ffffff', 20);
            this.playSound('megaboost');
          }
          this.createParticles(ent.x, ent.y, '#ffea00', 10);
          this.entities.splice(i, 1);
          continue;
        }
      }

      // Remove off-screen entities
      if (ent.x + ent.w < 0) {
        this.entities.splice(i, 1);
      }
    }

    // Clear entities after teleport
    if (didTeleport) {
      this.entities = [];
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx - (this.speed * 0.5); // move relative to world
      p.y += p.vy;
      p.life -= 0.05;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private render() {
    // Screen shake transform
    this.ctx.save();
    if (this.screenShakeTimer > 0) {
      const t = this.screenShakeTimer;
      const mag = this.screenShakeMag * Math.min(1, t / 150);
      this.ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
    }

    // Clear & Background
    this.ctx.fillStyle = '#111118';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Small grey particles in background
    if (this.frameCount % 10 === 0) {
      this.particles.push({
        x: this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: -this.speed * 0.2,
        vy: 0,
        size: 1,
        color: '#333333',
        life: 5.0
      });
    }

    // Parallax Warehouse Background
    this.drawWarehouseBackground();

    // Ground — warehouse concrete floor with tiles
    const floorH = this.canvas.height - this.groundY;
    // Base concrete colour
    this.ctx.fillStyle = '#1a1a22';
    this.ctx.fillRect(0, this.groundY, this.canvas.width, floorH);
    // Subtle depth gradient — lighter at front edge
    const floorGrad = this.ctx.createLinearGradient(0, this.groundY, 0, this.canvas.height);
    floorGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
    floorGrad.addColorStop(0.4, 'rgba(255,255,255,0.0)');
    this.ctx.fillStyle = floorGrad;
    this.ctx.fillRect(0, this.groundY, this.canvas.width, floorH);

    // Tile grid — vertical lines
    const tileSize = 80;
    const tileOffset = -(this.distance * 1.0) % tileSize;
    this.ctx.strokeStyle = '#28283a';
    this.ctx.lineWidth = 1;
    for (let tx = tileOffset; tx < this.canvas.width + tileSize; tx += tileSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(tx, this.groundY);
      this.ctx.lineTo(tx, this.canvas.height);
      this.ctx.stroke();
    }
    // Tile grid — horizontal lines
    const rowH = 40;
    for (let ry = this.groundY + rowH; ry < this.canvas.height; ry += rowH) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, ry);
      this.ctx.lineTo(this.canvas.width, ry);
      this.ctx.stroke();
    }
    // Occasional scuff/grime marks on floor
    const scuffSeed = Math.floor(this.distance / 40);
    for (let si = 0; si < 4; si++) {
      const scuffX = ((scuffSeed * 137 + si * 83) % this.canvas.width);
      const scuffY = this.groundY + 8 + ((scuffSeed * 53 + si * 47) % (floorH - 14));
      this.ctx.fillStyle = 'rgba(0,0,0,0.18)';
      this.ctx.fillRect(scuffX, scuffY, 28 + (si * 7) % 20, 3);
    }

    // Safety stripe — diagonal yellow/black hazard tape
    const stripeW = 20;
    const stripeOffset = -(this.distance * 1.0) % (stripeW * 2);
    for (let sx = stripeOffset - stripeW * 2; sx < this.canvas.width + stripeW; sx += stripeW * 2) {
      this.ctx.fillStyle = '#e8b800';
      this.ctx.fillRect(sx, this.groundY, stripeW, 5);
      this.ctx.fillStyle = '#0d0d14';
      this.ctx.fillRect(sx + stripeW, this.groundY, stripeW, 5);
    }
    // Stripe worn highlight
    this.ctx.fillStyle = 'rgba(255,220,60,0.12)';
    this.ctx.fillRect(0, this.groundY, this.canvas.width, 2);

    // PC assembly floor details: fallen cases, paperwork, cables, and grime.
    this.drawGroundWarehouseDetails();

    // Entities
    for (const ent of this.entities) {
      if (ent.type === 'obstacle') {
        const x = ent.x, y = ent.y, w = ent.w, h = ent.h;
        // Drop shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(x + 5, y + 6, w, h);
        // Crate outer frame — dark border
        this.ctx.fillStyle = '#5c3610';
        this.ctx.fillRect(x, y, w, h);
        // Crate face panel — lighter wood
        this.ctx.fillStyle = '#8c5520';
        this.ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        // Wood grain — subtle lighter streaks
        this.ctx.fillStyle = 'rgba(255,200,130,0.07)';
        for (let gi = 0; gi < 4; gi++) {
          const gx = x + 6 + gi * Math.floor((w - 12) / 4);
          this.ctx.fillRect(gx, y + 3, 2, h - 6);
        }
        // Plank horizontal dividers
        this.ctx.fillStyle = '#5c3610';
        const plankH = Math.floor(h / 3);
        for (let pi = 1; pi < 3; pi++) {
          this.ctx.fillRect(x + 3, y + 3 + pi * plankH - 1, w - 6, 2);
        }
        // Nail heads at plank intersections
        this.ctx.fillStyle = '#c8a060';
        const nailXs = [x + 7, x + w - 9];
        for (const nx of nailXs) {
          for (let pi = 1; pi < 3; pi++) {
            this.ctx.fillRect(nx, y + 2 + pi * plankH - 1, 3, 3);
          }
        }
        // Top face — lighter to suggest 3-D lid
        this.ctx.fillStyle = 'rgba(255,220,160,0.1)';
        this.ctx.fillRect(x + 3, y + 3, w - 6, 5);
        // Stencilled "FRAGILE" label — small coloured rectangle with lines
        const lblW = Math.max(16, Math.floor(w * 0.45));
        const lblH = Math.max(10, Math.floor(h * 0.22));
        const lblX = x + (w - lblW) / 2;
        const lblY = y + (h - lblH) / 2;
        this.ctx.fillStyle = '#d4a020';
        this.ctx.fillRect(lblX, lblY, lblW, lblH);
        this.ctx.fillStyle = '#5c3610';
        for (let li = 2; li < lblH - 2; li += 3) {
          this.ctx.fillRect(lblX + 2, lblY + li, lblW - 4, 1);
        }
      } else if (ent.type === 'platform') {
        const x = ent.x, y = ent.y, w = ent.w, h = ent.h;
        const variant = (ent as any).variant ?? 'server';
        if (variant === 'desk') {
          // ==================== DETAILED DESK SCENE ====================
          // Drop shadow on the floor
          this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
          this.ctx.fillRect(x + 4, y + h + 18, w, 6);

          // --- DESK LEGS ---
          this.ctx.fillStyle = '#4a4a60';
          this.ctx.fillRect(x + 6, y + h, 5, 20);
          this.ctx.fillRect(x + w - 11, y + h, 5, 20);
          // Leg feet (casters)
          this.ctx.fillStyle = '#2a2a38';
          this.ctx.fillRect(x + 3, y + h + 18, 11, 4);
          this.ctx.fillRect(x + w - 14, y + h + 18, 11, 4);
          // Wheels
          this.ctx.fillStyle = '#1a1a2e';
          this.ctx.fillRect(x + 5, y + h + 22, 3, 3);
          this.ctx.fillRect(x + w - 8, y + h + 22, 3, 3);

          // --- DESK BODY ---
          // Side panels
          this.ctx.fillStyle = '#4a3a2a';
          this.ctx.fillRect(x, y + 6, w, h - 6);
          // Desktop surface
          this.ctx.fillStyle = '#9B6B4F';
          this.ctx.fillRect(x, y, w, 8);
          // Wood grain on desktop
          this.ctx.fillStyle = 'rgba(0,0,0,0.08)';
          for (let gi = 0; gi < w; gi += 16) {
            this.ctx.fillRect(x + gi, y, 3, 8);
          }
          this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
          for (let gi = 8; gi < w; gi += 16) {
            this.ctx.fillRect(x + gi, y, 2, 8);
          }
          // Desktop edge highlight
          this.ctx.fillStyle = '#b08060';
          this.ctx.fillRect(x, y, w, 2);
          this.ctx.fillStyle = '#7a5035';
          this.ctx.fillRect(x, y + 6, w, 2);

          // Drawer panel on front
          this.ctx.fillStyle = '#3a2a1a';
          this.ctx.fillRect(x + 8, y + 10, w - 16, h - 14);
          // Drawer divider lines
          this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          this.ctx.lineWidth = 1;
          const drawerCount = w > 120 ? 3 : 2;
          const drawerW = (w - 20) / drawerCount;
          for (let di = 1; di < drawerCount; di++) {
            const dx = x + 10 + di * drawerW;
            this.ctx.beginPath();
            this.ctx.moveTo(dx, y + 12); this.ctx.lineTo(dx, y + h - 6);
            this.ctx.stroke();
          }
          // Drawer handles (rectangular pulls)
          for (let di = 0; di < drawerCount; di++) {
            const dx = x + 10 + di * drawerW + drawerW / 2;
            this.ctx.fillStyle = '#8888a0';
            this.ctx.fillRect(dx - 6, y + h / 2, 12, 4);
            // Handle shine
            this.ctx.fillStyle = '#aaaaC0';
            this.ctx.fillRect(dx - 5, y + h / 2, 10, 1);
          }

          // --- MONITOR (left side) ---
          const mx = x + 12, my = y - 28, mw = 36, mh = 28;
          // Stand base
          this.ctx.fillStyle = '#2a2a38';
          this.ctx.fillRect(mx + 8, my + mh, 20, 4);
          this.ctx.fillRect(mx + 14, my + mh - 4, 8, 4);
          // Stand neck
          this.ctx.fillStyle = '#3a3a50';
          this.ctx.fillRect(mx + 16, my + mh - 8, 4, 6);
          // Screen bezel
          this.ctx.fillStyle = '#1a1a2e';
          this.ctx.fillRect(mx, my, mw, mh);
          this.ctx.fillStyle = '#2a2a40';
          this.ctx.fillRect(mx + 2, my + 2, mw - 4, mh - 4);
          // Screen glow
          this.ctx.fillStyle = '#00aaff';
          this.ctx.fillRect(mx + 4, my + 4, mw - 8, mh - 10);
          // Screen content (grid lines)
          this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
          for (let si = 0; si < 3; si++) {
            this.ctx.fillRect(mx + 6, my + 6 + si * 5, mw - 12, 1);
          }
          // Screen highlight
          this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
          this.ctx.fillRect(mx + 4, my + 4, mw - 8, 3);
          // Power LED
          this.ctx.fillStyle = '#00ff00';
          this.ctx.fillRect(mx + mw - 8, my + mh - 4, 3, 2);
          // Screen glow outward
          this.ctx.shadowBlur = 8; this.ctx.shadowColor = '#00aaff';
          this.ctx.fillStyle = 'rgba(0,170,255,0.15)';
          this.ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
          this.ctx.shadowBlur = 0;

          // --- KEYBOARD (center) ---
          const kx = x + w / 2 - 20, ky = y + 1;
          this.ctx.fillStyle = '#2a2a38';
          this.ctx.fillRect(kx, ky, 40, 4);
          // Keys
          this.ctx.fillStyle = '#3a3a50';
          for (let ki = 0; ki < 10; ki++) {
            this.ctx.fillRect(kx + 2 + ki * 3.5, ky + 1, 3, 2);
          }
          // Key highlights
          this.ctx.fillStyle = '#4a4a70';
          for (let ki = 1; ki < 10; ki += 3) {
            this.ctx.fillRect(kx + 2 + ki * 3.5, ky + 1, 3, 1);
          }

          // --- MOUSE & MOUSEPAD (right of keyboard) ---
          const mpx = x + w / 2 + 24, mpy = y + 2;
          // Mousepad
          this.ctx.fillStyle = '#3a3a50';
          this.ctx.fillRect(mpx, mpy, 14, 4);
          // Mouse
          this.ctx.fillStyle = '#4a4a70';
          this.ctx.fillRect(mpx + 3, mpy - 2, 8, 6);
          this.ctx.fillStyle = '#2a2a38';
          this.ctx.fillRect(mpx + 4, mpy - 1, 2, 3);
          // Mouse scroll wheel
          this.ctx.fillStyle = '#8888a0';
          this.ctx.fillRect(mpx + 6, mpy - 1, 2, 1);
          // Mouse cord
          this.ctx.strokeStyle = '#3a3a50';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(mpx + 6, mpy + 4); this.ctx.lineTo(mpx + 2, mpy + 8); this.ctx.lineTo(mpx - 2, mpy + 6);
          this.ctx.stroke();

          // --- COFFEE MUG (right side) ---
          const cx = x + w - 22, cy = y - 6;
          // Mug shadow
          this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
          this.ctx.fillRect(cx + 1, cy + 8, 10, 3);
          // Mug body
          this.ctx.fillStyle = '#e0e0e0';
          this.ctx.fillRect(cx + 2, cy, 8, 10);
          // Mug handle
          this.ctx.fillStyle = '#e0e0e0';
          this.ctx.fillRect(cx + 10, cy + 3, 4, 4);
          this.ctx.fillStyle = '#2a2a38';
          this.ctx.fillRect(cx + 10, cy + 4, 2, 2);
          // Coffee inside
          this.ctx.fillStyle = '#4a2a1a';
          this.ctx.fillRect(cx + 3, cy + 2, 6, 4);
          // Steam wisps
          this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(cx + 4, cy - 2); this.ctx.lineTo(cx + 5, cy - 6);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.moveTo(cx + 7, cy - 1); this.ctx.lineTo(cx + 8, cy - 5);
          this.ctx.stroke();
          // Mug highlight
          this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
          this.ctx.fillRect(cx + 3, cy + 1, 2, 8);

          // --- PAPERS / SCATTERED DOCUMENTS ---
          if (w > 100) {
            // Paper 1
            this.ctx.fillStyle = '#f5f5dc';
            this.ctx.fillRect(x + 60, y + 2, 18, 10);
            this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
            this.ctx.fillRect(x + 62, y + 4, 14, 1);
            this.ctx.fillRect(x + 62, y + 7, 10, 1);
            // Paper 2 (slightly offset)
            this.ctx.fillStyle = '#f0f0d0';
            this.ctx.fillRect(x + 85, y + 3, 14, 8);
            this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
            this.ctx.fillRect(x + 87, y + 5, 8, 1);
          }

          // --- POTTED PLANT (left edge) ---
          const px = x + 52, py = y - 14;
          // Pot
          this.ctx.fillStyle = '#b86a3a';
          this.ctx.fillRect(px, py + 6, 10, 8);
          this.ctx.fillStyle = '#a05a30';
          this.ctx.fillRect(px, py + 6, 10, 2);
          // Dirt
          this.ctx.fillStyle = '#4a2a1a';
          this.ctx.fillRect(px + 1, py + 6, 8, 2);
          // Leaves
          this.ctx.fillStyle = '#2a8040';
          this.ctx.beginPath(); this.ctx.arc(px + 5, py + 4, 4, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.fillStyle = '#3a9050';
          this.ctx.beginPath(); this.ctx.arc(px + 3, py + 2, 3, 0, Math.PI * 2); this.ctx.fill();
          this.ctx.fillStyle = '#1a7030';
          this.ctx.beginPath(); this.ctx.arc(px + 7, py + 3, 3, 0, Math.PI * 2); this.ctx.fill();
          // Leaf highlights
          this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
          this.ctx.beginPath(); this.ctx.arc(px + 4, py + 3, 2, 0, Math.PI * 2); this.ctx.fill();

          // --- LANDING SURFACE GLOW (top edge) ---
          this.ctx.shadowBlur = 10; this.ctx.shadowColor = '#ffcc00';
          this.ctx.fillStyle = '#ffcc00';
          this.ctx.fillRect(x, y, w, 2);
          this.ctx.shadowBlur = 0;
          // Surface highlight
          this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
          this.ctx.fillRect(x, y, w, 1);

        } else {
          // ==================== DETAILED SERVER RACK SCENE ====================
          // Drop shadow
          this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
          this.ctx.fillRect(x + 4, y + h + 4, w, 6);

          // --- RACK FRAME ---
          // Outer frame
          this.ctx.fillStyle = '#1a1a2e';
          this.ctx.fillRect(x, y, w, h);
          // Frame rails (left and right)
          this.ctx.fillStyle = '#2a2a50';
          this.ctx.fillRect(x, y, 6, h);
          this.ctx.fillRect(x + w - 6, y, 6, h);
          // Frame rail highlight
          this.ctx.fillStyle = '#3a3a70';
          this.ctx.fillRect(x, y, 2, h);
          this.ctx.fillRect(x + w - 2, y, 2, h);
          // Top and bottom frame caps
          this.ctx.fillStyle = '#2a2a50';
          this.ctx.fillRect(x, y, w, 4);
          this.ctx.fillRect(x, y + h - 4, w, 4);
          // Rack mount holes on rails
          this.ctx.fillStyle = '#4a4a80';
          for (let hi = 6; hi < h - 6; hi += 10) {
            this.ctx.fillRect(x + 2, y + hi, 2, 2);
            this.ctx.fillRect(x + w - 4, y + hi, 2, 2);
          }

          // --- SERVER UNITS ---
          const unitH = 10;
          const unitCount = Math.floor((h - 8) / unitH);
          for (let ui = 0; ui < unitCount; ui++) {
            const uy = y + 4 + ui * unitH;
            const unitType = ui % 4; // 4 different unit designs
            // Unit background
            this.ctx.fillStyle = (ui % 2 === 0) ? '#222240' : '#1a1a3a';
            this.ctx.fillRect(x + 6, uy, w - 12, unitH - 1);
            // Unit front panel
            this.ctx.fillStyle = '#2a2a50';
            this.ctx.fillRect(x + 6, uy, w - 12, 2);

            if (unitType === 0) {
              // --- STORAGE UNIT (HDD bays) ---
              // Drive bays
              const bayCount = Math.floor((w - 20) / 14);
              for (let bi = 0; bi < bayCount; bi++) {
                const bx = x + 10 + bi * 14;
                // Bay frame
                this.ctx.fillStyle = '#1a1a2e';
                this.ctx.fillRect(bx, uy + 3, 12, 4);
                // Drive label
                this.ctx.fillStyle = '#3a3a60';
                this.ctx.fillRect(bx + 2, uy + 3, 8, 4);
                // Activity LED
                this.ctx.fillStyle = (bi % 3 === 0) ? '#ff6600' : '#00ff00';
                this.ctx.fillRect(bx + 9, uy + 4, 2, 2);
                // LED glow for active ones
                if (bi % 3 === 0) {
                  this.ctx.fillStyle = 'rgba(255,100,0,0.4)';
                  this.ctx.fillRect(bx + 8, uy + 3, 4, 4);
                }
              }
            } else if (unitType === 1) {
              // --- COMPUTE UNIT (LCD + vents) ---
              // LCD screen
              this.ctx.fillStyle = '#0a0a1e';
              this.ctx.fillRect(x + 10, uy + 2, 24, 6);
              // Screen data
              this.ctx.fillStyle = '#00ffcc';
              this.ctx.fillRect(x + 12, uy + 3, 4, 1);
              this.ctx.fillRect(x + 12, uy + 5, 8, 1);
              this.ctx.fillRect(x + 18, uy + 3, 2, 1);
              // Screen glow
              this.ctx.fillStyle = 'rgba(0,255,200,0.2)';
              this.ctx.fillRect(x + 10, uy + 2, 24, 6);
              // Vent grille
              this.ctx.fillStyle = '#3a3a60';
              const ventX = x + w - 24;
              for (let vi = 0; vi < 3; vi++) {
                this.ctx.fillRect(ventX + vi * 5, uy + 3, 4, 1);
                this.ctx.fillRect(ventX + vi * 5 + 2, uy + 5, 4, 1);
              }
              // Status LED
              this.ctx.fillStyle = '#00aaff';
              this.ctx.fillRect(x + 8, uy + 4, 2, 2);
            } else if (unitType === 2) {
              // --- NETWORK UNIT (ports + blinkenlights) ---
              // Port cluster
              const portColors = ['#00ff00', '#00ff00', '#ff0000', '#00ff00', '#ffff00', '#00ff00'];
              const portCount = Math.min(portColors.length, Math.floor((w - 16) / 8));
              for (let pi = 0; pi < portCount; pi++) {
                const pc = portColors[pi % portColors.length];
                this.ctx.fillStyle = '#1a1a2e';
                this.ctx.fillRect(x + 10 + pi * 8, uy + 3, 6, 4);
                // Port light
                this.ctx.fillStyle = pc;
                this.ctx.fillRect(x + 11 + pi * 8, uy + 4, 4, 2);
                // Port glow
                this.ctx.fillStyle = pc + '40';
                this.ctx.fillRect(x + 10 + pi * 8, uy + 3, 6, 4);
              }
            } else {
              // --- COOLING UNIT (fan + temp) ---
              // Fan housing
              this.ctx.fillStyle = '#1a1a2e';
              this.ctx.fillRect(x + 10, uy + 2, 8, 6);
              // Fan blades (cross)
              this.ctx.fillStyle = '#3a3a60';
              this.ctx.fillRect(x + 12, uy + 2, 2, 6);
              this.ctx.fillRect(x + 10, uy + 4, 8, 2);
              // Fan center
              this.ctx.fillStyle = '#4a4a80';
              this.ctx.beginPath(); this.ctx.arc(x + 13, uy + 5, 2, 0, Math.PI * 2); this.ctx.fill();
              // Temp display
              this.ctx.fillStyle = '#ff6600';
              this.ctx.fillRect(x + 24, uy + 3, 12, 4);
              this.ctx.fillStyle = '#1a1a2e';
              this.ctx.fillRect(x + 25, uy + 3, 10, 4);
              this.ctx.fillStyle = '#ff6600';
              this.ctx.fillRect(x + 26, uy + 4, 2, 1);
              this.ctx.fillRect(x + 29, uy + 4, 4, 1);
              // Vent holes
              this.ctx.fillStyle = '#2a2a50';
              const ventX = x + w - 18;
              for (let vi = 0; vi < 4; vi++) {
                this.ctx.fillRect(ventX + vi * 4, uy + 3, 3, 4);
              }
            }

            // Unit separator line
            this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x + 6, uy + unitH - 1); this.ctx.lineTo(x + w - 6, uy + unitH - 1);
            this.ctx.stroke();
          }

          // --- RACK TOP PANEL ---
          this.ctx.fillStyle = '#2a2a50';
          this.ctx.fillRect(x, y, w, 4);
          // Power switch
          this.ctx.fillStyle = '#ff0000';
          this.ctx.fillRect(x + w - 14, y + 1, 4, 2);
          this.ctx.fillStyle = 'rgba(255,0,0,0.4)';
          this.ctx.fillRect(x + w - 15, y, 6, 4);
          // Brand label
          this.ctx.fillStyle = '#4a4a80';
          this.ctx.fillRect(x + 8, y + 1, 16, 2);
          this.ctx.fillStyle = '#00ffcc';
          this.ctx.fillRect(x + 9, y + 1, 2, 2);
          this.ctx.fillRect(x + 12, y + 1, 2, 2);
          this.ctx.fillRect(x + 15, y + 1, 2, 2);

          // --- GLOWING TOP EDGE ---
          this.ctx.shadowBlur = 10; this.ctx.shadowColor = '#00ffcc';
          this.ctx.fillStyle = '#00ffcc';
          this.ctx.fillRect(x, y, w, 2);
          this.ctx.shadowBlur = 0;
          // Surface highlight
          this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
          this.ctx.fillRect(x, y, w, 1);

          // --- CABLES trailing out the bottom ---
          this.ctx.strokeStyle = '#3a3a60';
          this.ctx.lineWidth = 2;
          // Cable 1
          this.ctx.beginPath();
          this.ctx.moveTo(x + w / 2, y + h);
          this.ctx.lineTo(x + w / 2 - 4, y + h + 8);
          this.ctx.lineTo(x + w / 2 - 2, y + h + 14);
          this.ctx.stroke();
          // Cable 2
          this.ctx.beginPath();
          this.ctx.moveTo(x + w / 2 + 6, y + h);
          this.ctx.lineTo(x + w / 2 + 10, y + h + 6);
          this.ctx.lineTo(x + w / 2 + 8, y + h + 12);
          this.ctx.stroke();
          // Cable 3 (red power)
          this.ctx.strokeStyle = '#5a2a2a';
          this.ctx.beginPath();
          this.ctx.moveTo(x + w / 2 - 6, y + h);
          this.ctx.lineTo(x + w / 2 - 10, y + h + 10);
          this.ctx.lineTo(x + w / 2 - 14, y + h + 16);
          this.ctx.stroke();
          // Cable connectors
          this.ctx.fillStyle = '#4a4a60';
          this.ctx.fillRect(x + w / 2 - 3, y + h + 12, 3, 4);
          this.ctx.fillRect(x + w / 2 + 7, y + h + 10, 3, 4);
        }
      } else if (ent.type === 'cuda') {
        // Compact gold CUDA coin sprite
        const fx = ent.x, fy = ent.y, fw = ent.w, fh = ent.h;
        const pulse = Math.sin(this.frameCount * 0.12 + fx * 0.05) * 0.4 + 0.6;
        this.ctx.save();
        this.ctx.shadowBlur = 5 + pulse * 5;
        this.ctx.shadowColor = '#ffb900';
        if (this.cudaCoreSprite.complete && this.cudaCoreSprite.naturalWidth > 0) {
          this.ctx.drawImage(this.cudaCoreSprite, fx, fy, fw, fh);
        }
        this.ctx.restore();
      } else if (ent.type === 'jameo-cookie') {
        const pulse = Math.sin(this.frameCount * 0.16 + ent.x * 0.025) * 0.35 + 0.65;
        const cookieY = ent.y + Math.sin(this.frameCount * 0.08 + ent.x * 0.02) * 2;
        this.ctx.save();
        this.ctx.shadowBlur = 10 + pulse * 12;
        this.ctx.shadowColor = '#ff8a24';
        if (this.jameosCookieSprite.complete && this.jameosCookieSprite.naturalWidth > 0) {
          this.ctx.drawImage(this.jameosCookieSprite, ent.x, cookieY, ent.w, ent.h);
        } else {
          this.ctx.fillStyle = '#f58a24';
          this.ctx.fillRect(ent.x + 5, cookieY + 5, ent.w - 10, ent.h - 10);
        }
        this.ctx.shadowBlur = 0;
        this.ctx.font = '6px "Press Start 2P"';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffe36a';
        this.ctx.fillText("JAMEO'S COOKIE", ent.x + ent.w / 2, cookieY - 7);
        this.ctx.restore();
      } else if (ent.type === 'rarecd') {
        // Rare CD: a spinning holographic disc with a rainbow sheen
        const cx = ent.x + 12, cy = ent.y + 12 + Math.sin(this.frameCount * 0.1) * 3;
        const t = this.frameCount * 0.08;
        this.ctx.save();
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = '#ffffff';
        this.ctx.fillStyle = '#e8ecf4';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        const hues = ['#ff5aa5', '#ffd34d', '#54e0c0', '#7bb7ff', '#c05cff'];
        for (let k = 0; k < hues.length; k++) {
          const a = t + k * (Math.PI * 2 / hues.length);
          this.ctx.fillStyle = hues[k];
          this.ctx.globalAlpha = 0.55;
          this.ctx.beginPath();
          this.ctx.moveTo(cx, cy);
          this.ctx.arc(cx, cy, 11, a, a + 0.55);
          this.ctx.closePath();
          this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#0a0a14';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.font = '7px "Press Start 2P"';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('RARE CD', cx, cy - 18);
        this.ctx.restore();
      } else if (ent.type === 'flop') {
        // Black hole: multi-layer swirling energy
        const cx = ent.x + 9;
        const cy = ent.y + 9;
        const t = this.frameCount * 0.06;
        // Outermost diffuse glow
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#cc00ff';
        this.ctx.strokeStyle = 'rgba(170,0,255,0.3)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        this.ctx.stroke();
        // Mid glow ring
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#aa00ff';
        this.ctx.strokeStyle = '#aa00ff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        // Inner void gradient
        const voidG = this.ctx.createRadialGradient(cx, cy, 1, cx, cy, 7);
        voidG.addColorStop(0, '#000000');
        voidG.addColorStop(1, 'rgba(80,0,120,0.8)');
        this.ctx.fillStyle = voidG;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        this.ctx.fill();
        // Three spinning arcs at different speeds/offsets
        const arcs = [
          { color: '#ee88ff', r: 7.5, span: 0.7, speed: 1.0 },
          { color: 'rgba(200,100,255,0.6)', r: 6.5, span: 1.2, speed: -1.5 },
          { color: 'rgba(255,200,255,0.35)', r: 5, span: 0.5, speed: 2.2 },
        ];
        for (const arc of arcs) {
          const start = t * arc.speed;
          this.ctx.strokeStyle = arc.color;
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, arc.r, start, start + Math.PI * arc.span);
          this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
      } else if (ent.type === 'powerup') {
        // Shared powerup tinted background box
        const pwPulse = Math.sin(this.frameCount * 0.14 + ent.x * 0.03) * 0.3 + 0.7;
        const pwColors: Record<string, string> = {
          magnet: '#ff0044', booster: '#ff7700', megaboost: '#00cc00',
          jumpboost: '#dd00ff', scarletrush: '#9400d3', jetsurge: '#ff5500',
          supernova: '#ffcc00', teleport: '#00ffff'
        };
        const pwColor = pwColors[ent.powerType] || '#ffffff';
        // Glowing background tile
        this.ctx.shadowBlur = 12 * pwPulse; this.ctx.shadowColor = pwColor;
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(ent.x - 1, ent.y - 1, ent.w + 2, ent.h + 2);
        this.ctx.strokeStyle = pwColor;
        this.ctx.lineWidth = 1.5;
        this.ctx.globalAlpha = 0.6 + pwPulse * 0.4;
        this.ctx.strokeRect(ent.x - 1, ent.y - 1, ent.w + 2, ent.h + 2);
        this.ctx.globalAlpha = 1.0;
        this.ctx.shadowBlur = 0;

        if (ent.powerType === 'magnet') {
          // Horseshoe Magnet with N/S tips
          this.ctx.strokeStyle = '#ff2244';
          this.ctx.lineWidth = 4;
          this.ctx.shadowBlur = 6; this.ctx.shadowColor = '#ff0044';
          this.ctx.beginPath();
          this.ctx.arc(ent.x + 12, ent.y + 11, 8, Math.PI, 0);
          this.ctx.stroke();
          this.ctx.shadowBlur = 0;
          // North pole (blue)
          this.ctx.fillStyle = '#4488ff';
          this.ctx.fillRect(ent.x + 4, ent.y + 11, 5, 8);
          // South pole (red)
          this.ctx.fillStyle = '#ff2244';
          this.ctx.fillRect(ent.x + 15, ent.y + 11, 5, 8);
          // Tip sparks
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillRect(ent.x + 5, ent.y + 18, 3, 2);
          this.ctx.fillRect(ent.x + 16, ent.y + 18, 3, 2);
        } else if (ent.powerType === 'booster') {
          // Triple speed arrows
          this.ctx.shadowBlur = 6; this.ctx.shadowColor = '#ff8800';
          for (let ai = 0; ai < 3; ai++) {
            const ao = ai * 6;
            this.ctx.fillStyle = `rgba(255,${100 + ai * 50},0,${0.5 + ai * 0.25})`;
            this.ctx.beginPath();
            this.ctx.moveTo(ent.x + 2 + ao, ent.y + 7);
            this.ctx.lineTo(ent.x + 8 + ao, ent.y + 12);
            this.ctx.lineTo(ent.x + 2 + ao, ent.y + 17);
            this.ctx.fill();
          }
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'megaboost') {
          // Green Lightning Bolt with glow
          this.ctx.shadowBlur = 8; this.ctx.shadowColor = '#00ff44';
          this.ctx.fillStyle = '#00ff44';
          this.ctx.beginPath();
          this.ctx.moveTo(ent.x + 16, ent.y + 3);
          this.ctx.lineTo(ent.x + 7, ent.y + 13);
          this.ctx.lineTo(ent.x + 12, ent.y + 13);
          this.ctx.lineTo(ent.x + 7, ent.y + 22);
          this.ctx.lineTo(ent.x + 17, ent.y + 11);
          this.ctx.lineTo(ent.x + 12, ent.y + 11);
          this.ctx.closePath();
          this.ctx.fill();
          // Inner highlight
          this.ctx.fillStyle = 'rgba(200,255,200,0.5)';
          this.ctx.beginPath();
          this.ctx.moveTo(ent.x + 15, ent.y + 5);
          this.ctx.lineTo(ent.x + 10, ent.y + 12);
          this.ctx.lineTo(ent.x + 13, ent.y + 12);
          this.ctx.fill();
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'jumpboost') {
          // Double chevron up arrows
          this.ctx.shadowBlur = 6; this.ctx.shadowColor = '#dd00ff';
          for (let ai = 0; ai < 2; ai++) {
            const ay = ai * 8;
            this.ctx.fillStyle = ai === 0 ? '#ff44ff' : 'rgba(255,100,255,0.5)';
            this.ctx.beginPath();
            this.ctx.moveTo(ent.x + 5, ent.y + 17 - ay);
            this.ctx.lineTo(ent.x + 12, ent.y + 9 - ay);
            this.ctx.lineTo(ent.x + 19, ent.y + 17 - ay);
            this.ctx.lineTo(ent.x + 16, ent.y + 17 - ay);
            this.ctx.lineTo(ent.x + 12, ent.y + 12 - ay);
            this.ctx.lineTo(ent.x + 8, ent.y + 17 - ay);
            this.ctx.closePath();
            this.ctx.fill();
          }
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'scarletrush') {
          // Purple Star with inner glow
          this.ctx.shadowBlur = 10; this.ctx.shadowColor = '#cc00ff';
          this.ctx.fillStyle = '#bb00ff';
          this.drawStar(ent.x + 12, ent.y + 12, 5, 11, 5);
          this.ctx.fillStyle = 'rgba(255,180,255,0.5)';
          this.drawStar(ent.x + 12, ent.y + 12, 5, 7, 3);
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'jetsurge') {
          // Detailed jetpack
          this.ctx.shadowBlur = 6; this.ctx.shadowColor = '#ff5500';
          // Tank body
          this.ctx.fillStyle = '#888898';
          this.ctx.fillRect(ent.x + 6, ent.y + 3, 12, 14);
          // Straps
          this.ctx.fillStyle = '#555560';
          this.ctx.fillRect(ent.x + 8, ent.y + 3, 2, 14);
          this.ctx.fillRect(ent.x + 14, ent.y + 3, 2, 14);
          // Nozzles
          this.ctx.fillStyle = '#444450';
          this.ctx.fillRect(ent.x + 7, ent.y + 17, 4, 3);
          this.ctx.fillRect(ent.x + 13, ent.y + 17, 4, 3);
          // Flame burst
          this.ctx.fillStyle = '#ff6600';
          this.ctx.fillRect(ent.x + 8, ent.y + 20, 2, 3 + Math.floor(pwPulse * 2));
          this.ctx.fillStyle = '#ffcc00';
          this.ctx.fillRect(ent.x + 14, ent.y + 20, 2, 2 + Math.floor(pwPulse * 2));
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'supernova') {
          // Glowing 8-point star
          this.ctx.shadowBlur = 14; this.ctx.shadowColor = '#ffdd00';
          this.ctx.fillStyle = '#ffee44';
          this.drawStar(ent.x + 12, ent.y + 12, 8, 11, 4);
          this.ctx.fillStyle = '#ffffff';
          this.drawStar(ent.x + 12, ent.y + 12, 8, 6, 2);
          this.ctx.shadowBlur = 0;
        } else if (ent.powerType === 'teleport') {
          // Portal rings with spinning beam
          this.ctx.shadowBlur = 10; this.ctx.shadowColor = '#00ffff';
          this.ctx.strokeStyle = '#00ffff';
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(ent.x + 12, ent.y + 12, 10, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.strokeStyle = 'rgba(0,255,255,0.5)';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.arc(ent.x + 12, ent.y + 12, 7, 0, Math.PI * 2);
          this.ctx.stroke();
          // Spinning inner arc
          const ta = this.frameCount * 0.1;
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.arc(ent.x + 12, ent.y + 12, 8, ta, ta + Math.PI * 0.6);
          this.ctx.stroke();
          // Arrow pointing right
          this.ctx.fillStyle = '#00ffff';
          this.ctx.beginPath();
          this.ctx.moveTo(ent.x + 7, ent.y + 9);
          this.ctx.lineTo(ent.x + 15, ent.y + 12);
          this.ctx.lineTo(ent.x + 7, ent.y + 15);
          this.ctx.fill();
          this.ctx.shadowBlur = 0;
        }
      }
    }

    // Particles
    for (const p of this.particles) {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
      this.ctx.globalAlpha = 1.0;
    }

    // Draw Player (Jared) — full pixel-art sprite
    let drawH = this.player.height;
    let drawY = this.player.y;
    if (this.player.squishTimer > 0) {
      drawH -= 10;
      drawY += 10;
    }
    const px = this.player.x;
    const squishScale = drawH / this.player.height;

    // Shadow
    this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    this.ctx.fillRect(px + 2, drawY + drawH - 2, 38, 5);

    // LEGS (animated stride)
    const stride = this.player.isGrounded ? (Math.floor(this.frameCount / 7) % 2) : 0;
    const legH = Math.floor(18 * squishScale);
    const legY = drawY + Math.floor(38 * squishScale);
    this.ctx.fillStyle = '#1a2a8e'; // dark blue pants
    // Left leg
    const leftLegExtra = stride === 0 ? 3 : 0;
    this.ctx.fillRect(px + 4, legY, 13, legH + leftLegExtra);
    // Right leg
    const rightLegExtra = stride === 1 ? 3 : 0;
    this.ctx.fillRect(px + 23, legY, 13, legH + rightLegExtra);
    // Shoes
    this.ctx.fillStyle = '#111111';
    this.ctx.fillRect(stride === 0 ? px + 1 : px + 4, legY + legH + leftLegExtra - 1, 17, 6);
    this.ctx.fillRect(stride === 1 ? px + 20 : px + 23, legY + legH + rightLegExtra - 1, 17, 6);

    // BELT
    this.ctx.fillStyle = '#222222';
    this.ctx.fillRect(px, drawY + Math.floor(36 * squishScale), 40, Math.floor(4 * squishScale));
    this.ctx.fillStyle = '#888888';
    this.ctx.fillRect(px + 17, drawY + Math.floor(36 * squishScale), 6, Math.floor(4 * squishScale));

    // SHIRT BODY
    const shirtH = Math.floor(37 * squishScale);
    this.ctx.fillStyle = this.playerSkin.color;
    this.ctx.fillRect(px, drawY, 40, shirtH);
    if (this.playerSkin.animated) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(px, drawY, 40, shirtH);
      this.ctx.clip();
      if (this.playerSkin.color === '#0a0a0a') {
        // [REDACTED] skin: black shirt with red boxes drifting across it
        const scroll = (this.frameCount * 0.9) % 16;
        for (let row = 0; row < 4; row++) {
          for (let col = -1; col < 4; col++) {
            const phase = (row % 2 === 0) ? scroll : -scroll;
            const bx = px + col * 14 + phase + (row % 2) * 7;
            const by = drawY + 3 + row * 9;
            const flicker = 0.55 + 0.45 * Math.sin(this.frameCount * 0.15 + row * 1.7 + col);
            this.ctx.fillStyle = `rgba(255, 42, 42, ${flicker.toFixed(2)})`;
            this.ctx.fillRect(Math.round(bx), by, 6, 6);
          }
        }
      } else if (this.playerSkin.id === 'super_nova_prime') {
        // Chrono Supernova (0.01% SUPER): Blazing solar core & chrono flares
        const pulse = Math.sin(this.frameCount * 0.18) * 0.2 + 1.0;
        const grad = this.ctx.createRadialGradient(px + 20, drawY + shirtH / 2, 2, px + 20, drawY + shirtH / 2, 24 * pulse);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, '#ffe600');
        grad.addColorStop(0.7, '#ff3b00');
        grad.addColorStop(1, '#ff0055');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(px, drawY, 40, shirtH);

        // Radiating solar flares
        const flareAngle = (this.frameCount * 0.08) % (Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 230, 0, 0.7)';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = flareAngle + (i * Math.PI) / 2;
          const fx = px + 20 + Math.cos(a) * 16;
          const fy = drawY + shirtH / 2 + Math.sin(a) * 12;
          this.ctx.beginPath();
          this.ctx.moveTo(px + 20, drawY + shirtH / 2);
          this.ctx.lineTo(fx, fy);
          this.ctx.stroke();
        }
      } else if (this.playerSkin.id === 'singularity_void') {
        // Void Singularity (0.01% SUPER): Dark matter vortex tearing reality
        const spin = (this.frameCount * 0.06) % (Math.PI * 2);
        const grad = this.ctx.createRadialGradient(px + 20, drawY + shirtH / 2, 3, px + 20, drawY + shirtH / 2, 22);
        grad.addColorStop(0, '#020008');
        grad.addColorStop(0.5, '#7928ca');
        grad.addColorStop(1, '#00ffff');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(px, drawY, 40, shirtH);

        // Accretion disk spiral arcs
        this.ctx.lineWidth = 1.8;
        this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(px + 20, drawY + shirtH / 2, 10, spin, spin + Math.PI * 0.8);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(220, 100, 255, 0.7)';
        this.ctx.beginPath();
        this.ctx.arc(px + 20, drawY + shirtH / 2, 14, spin + Math.PI, spin + Math.PI * 1.8);
        this.ctx.stroke();
      } else {
        // Quantum Holo legendary animated skin: prismatic spectrum shimmer
        const hue = (this.frameCount * 3) % 360;
        const grad = this.ctx.createLinearGradient(px, drawY, px + 40, drawY + shirtH);
        grad.addColorStop(0, `hsl(${hue}, 100%, 65%)`);
        grad.addColorStop(0.5, `hsl(${(hue + 90) % 360}, 100%, 75%)`);
        grad.addColorStop(1, `hsl(${(hue + 180) % 360}, 100%, 65%)`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(px, drawY, 40, shirtH);

        // Specular glint
        const glintX = px + ((this.frameCount * 1.5) % 60) - 10;
        const glintGrad = this.ctx.createLinearGradient(glintX, drawY, glintX + 15, drawY + shirtH);
        glintGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
        glintGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.6)");
        glintGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
        this.ctx.fillStyle = glintGrad;
        this.ctx.fillRect(px, drawY, 40, shirtH);
      }
      this.ctx.restore();
    }
    // Shirt depth shading
    this.ctx.fillStyle = this.playerSkin.shadow;
    this.ctx.fillRect(px, drawY, 5, Math.floor(37 * squishScale));
    this.ctx.fillRect(px + 35, drawY, 5, Math.floor(37 * squishScale));
    // Pocket
    this.ctx.fillStyle = this.playerSkin.shadow;
    this.ctx.fillRect(px + 6, drawY + 8, 10, 8);
    this.ctx.fillStyle = this.playerSkin.accent;
    this.ctx.fillRect(px + 6, drawY + 8, 10, 2);

    // ARMS
    this.ctx.fillStyle = '#ffd1b3';
    this.ctx.fillRect(px - 5, drawY + 4, 7, Math.floor(20 * squishScale));
    this.ctx.fillRect(px + 38, drawY + 4, 7, Math.floor(20 * squishScale));

    // COLLAR
    this.ctx.fillStyle = '#ffd1b3';
    this.ctx.fillRect(px + 14, drawY, 12, 6);

    // HEAD
    // Hair
    this.ctx.fillStyle = '#2a1500';
    this.ctx.fillRect(px + 8, drawY - 22, 26, 8);
    this.ctx.fillRect(px + 8, drawY - 22, 5, 16);
    // Skin
    this.ctx.fillStyle = '#ffd1b3';
    this.ctx.fillRect(px + 10, drawY - 15, 22, 16);
    // Ears
    this.ctx.fillStyle = '#ffbf9c';
    this.ctx.fillRect(px + 7, drawY - 12, 4, 7);
    this.ctx.fillRect(px + 31, drawY - 12, 4, 7);
    // Glasses lenses (tinted)
    this.ctx.fillStyle = 'rgba(80,160,255,0.4)';
    this.ctx.fillRect(px + 12, drawY - 11, 8, 5);
    this.ctx.fillRect(px + 22, drawY - 11, 8, 5);
    // Frames
    this.ctx.strokeStyle = '#111111';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 12, drawY - 11, 8, 5);
    this.ctx.strokeRect(px + 22, drawY - 11, 8, 5);
    // Bridge
    this.ctx.fillStyle = '#111111';
    this.ctx.fillRect(px + 20, drawY - 10, 2, 2);
    // Temple arms
    this.ctx.fillRect(px + 9, drawY - 10, 3, 1);
    this.ctx.fillRect(px + 30, drawY - 10, 3, 1);
    // Mouth
    this.ctx.fillStyle = '#cc8866';
    this.ctx.fillRect(px + 16, drawY - 3, 8, 2);

    // Magnet Effect Aura
    if (this.magnetActive) {
      this.ctx.strokeStyle = 'rgba(255, 0, 80, 0.5)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(this.player.x + 20, this.player.y + 30, 80 + Math.sin(this.frameCount * 0.2) * 10, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    
    // Booster Trail
    if (this.boosterActive) {
      this.ctx.fillStyle = 'rgba(255, 136, 0, 0.4)';
      this.ctx.fillRect(this.player.x - 20, this.player.y + 10, 20, this.player.height - 20);
      this.ctx.fillRect(this.player.x - 40, this.player.y + 20, 20, this.player.height - 40);
    }
    
    // Megaboost Aura
    if (this.megaBoostActive) {
      this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(this.player.x - 5, this.player.y - 5, this.player.width + 10, this.player.height + 10);
    }

    // HUD
    this.drawHUD();
    this.drawLotusMarker();

    // Screen Tints
    if (this.supernovaActive) {
      this.ctx.fillStyle = 'rgba(255, 100, 200, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.scarletRushActive) {
      this.ctx.fillStyle = 'rgba(148, 0, 211, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.jetSurgeActive) {
      this.ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.megaBoostActive) {
      this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.jumpBoostActive) {
      this.ctx.fillStyle = 'rgba(255, 192, 203, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else if (this.magnetActive || this.boosterActive) {
      this.ctx.fillStyle = this.magnetActive ? 'rgba(255, 0, 0, 0.1)' : 'rgba(255, 165, 0, 0.1)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Teleport flash
    if (this.teleportFlashTimer > 0) {
      const alpha = Math.min(0.8, this.teleportFlashTimer / 150);
      this.ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Restore after screen shake
    this.ctx.restore();

    // POST-PROCESSING (always full canvas, not affected by shake)

    // Chromatic aberration on death/hit
    if (this.chromaTimer > 0) {
      const strength = this.chromaIntensity * Math.min(1, this.chromaTimer / 200);
      const W = this.canvas.width, H = this.canvas.height;
      const imageData = this.ctx.getImageData(0, 0, W, H);
      const out = this.ctx.createImageData(W, H);
      const src = imageData.data;
      const dst = out.data;
      const offset = Math.floor(strength);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const rSrc = Math.min(W - 1, x + offset);
          const bSrc = Math.max(0, x - offset);
          const ri = (y * W + rSrc) * 4;
          const bi = (y * W + bSrc) * 4;
          dst[i]     = src[ri];      // R from right
          dst[i + 1] = src[i + 1];   // G unchanged
          dst[i + 2] = src[bi + 2];  // B from left
          dst[i + 3] = src[i + 3];
        }
      }
      this.ctx.putImageData(out, 0, 0);
    }

    // Vignette
    this.drawVignette();

    // Silicon Lottery overlay (always on top)
    this.drawSiliconLottery();
  }

  private drawGroundWarehouseDetails() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const floorH = H - this.groundY;
    const worldScroll = this.distance * 0.92;
    const sectionWidth = 230;
    const firstSection = Math.floor(worldScroll / sectionWidth) - 2;
    const lastSection = firstSection + Math.ceil(W / sectionWidth) + 4;
    const hash = (value: number) => {
      const result = Math.sin(value * 12.9898) * 43758.5453;
      return result - Math.floor(result);
    };

    for (let section = firstSection; section <= lastSection; section++) {
      const sectionX = section * sectionWidth - worldScroll;
      const detailX = sectionX + 28 + hash(section + 4) * 120;
      const detailY = this.groundY + 10 + hash(section + 8) * Math.max(12, floorH - 34);

      // Dirt/oil spot with a few pixel-sized splatters.
      ctx.save();
      ctx.fillStyle = 'rgba(5, 5, 10, 0.34)';
      ctx.beginPath();
      ctx.ellipse(
        detailX,
        detailY,
        22 + hash(section) * 18,
        4 + hash(section + 1) * 5,
        hash(section + 2) * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = 'rgba(73, 58, 46, 0.42)';
      for (let dot = 0; dot < 4; dot++) {
        const dotX = detailX - 27 + hash(section + dot + 20) * 54;
        const dotY = detailY - 7 + hash(section + dot + 30) * 15;
        ctx.fillRect(dotX, dotY, 2 + dot % 2, 2);
      }
      ctx.restore();

      // Loose packing slip or build sheet, marked with tiny assembly lines.
      const paperX = sectionX + 105 + hash(section + 14) * 72;
      const paperY = this.groundY + 35 + hash(section + 15) * 22;
      ctx.save();
      ctx.translate(paperX, paperY);
      ctx.rotate((hash(section + 16) - 0.5) * 0.42);
      ctx.fillStyle = 'rgba(216, 211, 181, 0.88)';
      ctx.fillRect(-17, -11, 34, 22);
      ctx.fillStyle = 'rgba(70, 71, 64, 0.42)';
      ctx.fillRect(-12, -6, 17, 2);
      ctx.fillRect(-12, -1, 24, 1);
      ctx.fillRect(-12, 4, 12, 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(-14, -9, 25, 1);
      ctx.restore();

      // Every other section has a discarded PC tower or a display sample.
      if (section % 3 === 0) {
        const caseX = sectionX + 155 + hash(section + 40) * 45;
        const caseY = this.groundY + 43;
        ctx.save();
        ctx.translate(caseX, caseY);
        ctx.rotate((hash(section + 41) - 0.5) * 0.28);

        // Case shadow and tipped tower body.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(-29, 13, 60, 7);
        ctx.fillStyle = '#171b28';
        ctx.fillRect(-28, -10, 57, 25);
        ctx.fillStyle = '#30384a';
        ctx.fillRect(-25, -7, 51, 4);
        ctx.fillStyle = '#0d1019';
        ctx.fillRect(-21, -1, 35, 13);
        ctx.strokeStyle = '#4a5770';
        ctx.lineWidth = 1;
        ctx.strokeRect(-21, -1, 35, 13);

        // Side window, fans, and a muted RGB diagnostic strip.
        ctx.fillStyle = 'rgba(70, 112, 135, 0.45)';
        ctx.fillRect(-17, 1, 25, 8);
        ctx.fillStyle = 'rgba(92, 216, 203, 0.64)';
        ctx.fillRect(-14, 3, 4, 4);
        ctx.fillStyle = 'rgba(214, 102, 208, 0.54)';
        ctx.fillRect(-7, 3, 4, 4);
        ctx.fillStyle = 'rgba(255, 198, 79, 0.5)';
        ctx.fillRect(0, 3, 4, 4);
        ctx.fillStyle = '#7f8ca1';
        ctx.fillRect(18, 1, 3, 5);
        ctx.fillStyle = '#e4b84b';
        ctx.fillRect(20, 9, 3, 2);

        // Loose power lead trailing onto the floor.
        ctx.strokeStyle = '#11131d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(25, 10);
        ctx.bezierCurveTo(34, 17, 27, 22, 39, 25);
        ctx.stroke();
        ctx.restore();
      } else if (section % 3 === 1) {
        // A small upright prebuilt sample waiting beside the lane.
        const towerX = sectionX + 48 + hash(section + 55) * 36;
        const towerBottom = this.groundY + floorH - 5;
        const towerH = 35 + hash(section + 56) * 12;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.fillRect(towerX - 16, towerBottom - 1, 34, 5);
        ctx.fillStyle = '#202638';
        ctx.fillRect(towerX - 14, towerBottom - towerH, 28, towerH);
        ctx.fillStyle = '#3d4960';
        ctx.fillRect(towerX - 11, towerBottom - towerH + 3, 22, 3);
        ctx.fillStyle = '#111622';
        ctx.fillRect(towerX - 9, towerBottom - towerH + 10, 18, towerH - 17);
        ctx.fillStyle = '#4fe0bd';
        ctx.fillRect(towerX - 5, towerBottom - towerH + 14, 3, 3);
        ctx.fillStyle = '#77839a';
        ctx.fillRect(towerX + 4, towerBottom - towerH + 14, 3, 2);
      }
    }
  }

  private drawVignette() {
    const W = this.canvas.width, H = this.canvas.height;
    const grad = this.ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,10,0.72)');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, W, H);
  }

  private drawStar(cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      this.ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      this.ctx.lineTo(x, y);
      rot += step;
    }
    this.ctx.lineTo(cx, cy - outerRadius);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawWarehouseBackground() {
    const W = this.canvas.width;
    const gY = this.groundY;

    if (this.warehouseBackgroundSprite.complete && this.warehouseBackgroundSprite.naturalWidth > 0) {
      this.ctx.drawImage(this.warehouseBackgroundSprite, 0, 0, W, this.canvas.height);
      this.drawCompanyAssemblyFloor(gY);
      this.drawDistantForklift(gY);
      return;
    }

    // BACKGROUND GRADIENT — atmospheric depth
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, gY);
    bgGrad.addColorStop(0, '#151827');
    bgGrad.addColorStop(0.5, '#20243a');
    bgGrad.addColorStop(1, '#292c42');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, W, gY);

    // BACK WALL — concrete panels with bevelled seams
    const wallOffset = -(this.distance * 0.06) % 160;
    for (let i = -1; i < W / 160 + 2; i++) {
      const wx = wallOffset + i * 160;
      // Panel fill — slight vertical gradient for depth
      const panelG = this.ctx.createLinearGradient(wx, 55, wx + 160, 55);
      panelG.addColorStop(0, '#20243a');
      panelG.addColorStop(0.5, '#282d45');
      panelG.addColorStop(1, '#20243a');
      this.ctx.fillStyle = panelG;
      this.ctx.fillRect(wx, 55, 160, gY - 55);
      // Panel seam — dark groove
      this.ctx.fillStyle = '#15192a';
      this.ctx.fillRect(wx, 55, 2, gY - 55);
      // Panel seam highlight
      this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
      this.ctx.fillRect(wx + 2, 55, 1, gY - 55);
      // Occasional horizontal bolt line
      this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
      this.ctx.fillRect(wx, 55 + (gY - 55) / 2, 160, 1);
    }

    // CEILING
    const ceilGrad = this.ctx.createLinearGradient(0, 0, 0, 60);
    ceilGrad.addColorStop(0, '#0c1020');
    ceilGrad.addColorStop(1, '#1b2034');
    this.ctx.fillStyle = ceilGrad;
    this.ctx.fillRect(0, 0, W, 60);

    // Ceiling I-beams (slowest parallax)
    const beamOffset = -(this.distance * 0.08) % 320;
    for (let i = -1; i < W / 320 + 2; i++) {
      const bx = beamOffset + i * 320;
      // Top flange
      this.ctx.fillStyle = '#2b3046';
      this.ctx.fillRect(bx - 32, 0, 84, 12);
      // Web
      this.ctx.fillStyle = '#252a40';
      this.ctx.fillRect(bx, 0, 22, 58);
      // Web edge highlights
      this.ctx.fillStyle = 'rgba(255,255,255,0.04)';
      this.ctx.fillRect(bx, 0, 2, 58);
      this.ctx.fillRect(bx + 20, 0, 2, 58);
      // Bottom flange
      this.ctx.fillStyle = '#30364e';
      this.ctx.fillRect(bx - 22, 52, 66, 8);
      // Chain hanging from beam
      this.ctx.fillStyle = '#1a1a28';
      const chainX = bx + 10;
      for (let cy = 60; cy < 120; cy += 8) {
        this.ctx.fillRect(chainX, cy, 4, 4);
        this.ctx.fillRect(chainX + 2, cy + 4, 4, 4);
      }
    }

    // Fluorescent lights (medium parallax)
    const lightOffset = -(this.distance * 0.12) % 400;
    for (let i = -1; i < W / 400 + 2; i++) {
      const lx = lightOffset + i * 400;
      // Fixture housing — deeper detail
      this.ctx.fillStyle = '#1c1c28';
      this.ctx.fillRect(lx + 36, 48, 128, 12);
      this.ctx.fillStyle = '#141420';
      this.ctx.fillRect(lx + 36, 48, 128, 3);
      // Conduit running from beam
      this.ctx.fillStyle = '#292e45';
      this.ctx.fillRect(lx + 90, 20, 5, 30);
      this.ctx.fillRect(lx + 105, 20, 5, 30);
      // Light tube — flicker
      const flicker = Math.sin(this.frameCount * 0.07 + i * 1.7) > 0.97
        ? (Math.sin(this.frameCount * 0.5) > 0 ? 0.2 : 0.6)
        : 1.0;
      this.ctx.globalAlpha = flicker;
      // Tube glow halo
      this.ctx.shadowBlur = 10; this.ctx.shadowColor = 'rgba(255,253,200,0.95)';
      this.ctx.fillStyle = '#fffbdc';
      this.ctx.fillRect(lx + 40, 55, 120, 5);
      this.ctx.shadowBlur = 0;
      // Diffuse glow cone — wider and brighter
      const grad = this.ctx.createLinearGradient(lx + 100, 60, lx + 100, gY);
      grad.addColorStop(0, 'rgba(255,252,180,0.18)');
      grad.addColorStop(0.3, 'rgba(255,252,180,0.07)');
      grad.addColorStop(1, 'rgba(255,252,180,0)');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.moveTo(lx + 40, 60);
      this.ctx.lineTo(lx + 160, 60);
      this.ctx.lineTo(lx + 240, gY);
      this.ctx.lineTo(lx - 40, gY);
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    }

    // BACK shelving units (slow parallax)
    const shelfOffset2 = -(this.distance * 0.18) % 500;
    for (let i = -1; i < W / 500 + 2; i++) {
      const sx = shelfOffset2 + i * 500;
      // Shelf shadow
      this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
      this.ctx.fillRect(sx + 5, 82, 140, gY - 82);
      // Shelf frame body
      this.ctx.fillStyle = '#181826';
      this.ctx.fillRect(sx, 80, 140, gY - 80);
      // Shelf boards
      const boxColors = [
        ['#4a2e0e', '#5c3a12', '#3a2208'],
        ['#0e2840', '#164060', '#0a1e30'],
        ['#220e38', '#341650', '#160a28'],
        ['#0e3018', '#165026', '#0a2010'],
      ];
      for (let s = 0; s < 4; s++) {
        const sy = 80 + s * 110;
        // Shelf board — metallic sheen
        const boardG = this.ctx.createLinearGradient(sx, sy, sx, sy + 10);
        boardG.addColorStop(0, '#2a2a38');
        boardG.addColorStop(1, '#1c1c28');
        this.ctx.fillStyle = boardG;
        this.ctx.fillRect(sx, sy, 140, 10);
        // Edge highlight on board
        this.ctx.fillStyle = 'rgba(255,255,255,0.05)';
        this.ctx.fillRect(sx, sy, 140, 1);
        // Boxes — varying sizes and colours
        const [dark, mid, shadow] = boxColors[s % 4];
        // Box A
        this.ctx.fillStyle = shadow;
        this.ctx.fillRect(sx + 9, sy + 90, 54, 1);
        this.ctx.fillStyle = mid;
        this.ctx.fillRect(sx + 8, sy + 12, 54, 78);
        this.ctx.fillStyle = dark;
        this.ctx.fillRect(sx + 8, sy + 12, 8, 78);
        // Box A label strip
        this.ctx.fillStyle = 'rgba(255,200,100,0.15)';
        this.ctx.fillRect(sx + 18, sy + 22, 38, 12);
        // Box B
        this.ctx.fillStyle = shadow;
        this.ctx.fillRect(sx + 73, sy + 90, 60, 1);
        this.ctx.fillStyle = mid;
        this.ctx.fillRect(sx + 72, sy + 18, 60, 72);
        this.ctx.fillStyle = dark;
        this.ctx.fillRect(sx + 72, sy + 18, 8, 72);
        // Glow strip on box B
        this.ctx.fillStyle = 'rgba(0,255,180,0.08)';
        this.ctx.fillRect(sx + 72, sy + 18, 60, 6);
      }
      // Vertical uprights — ribbed steel look
      this.ctx.fillStyle = '#10101c';
      this.ctx.fillRect(sx, 80, 8, gY - 80);
      this.ctx.fillRect(sx + 132, 80, 8, gY - 80);
      // Upright highlight
      this.ctx.fillStyle = 'rgba(255,255,255,0.04)';
      this.ctx.fillRect(sx + 1, 80, 2, gY - 80);
      this.ctx.fillRect(sx + 133, 80, 2, gY - 80);
    }

    // MIDDLE shelving (medium parallax) — taller uprights, more boxes
    const shelfOffset1 = -(this.distance * 0.35) % 300;
    for (let i = -1; i < W / 300 + 2; i++) {
      const sx = shelfOffset1 + i * 300;
      // Upright
      this.ctx.fillStyle = '#1c1c2c';
      this.ctx.fillRect(sx, 140, 14, gY - 140);
      this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
      this.ctx.fillRect(sx + 1, 140, 2, gY - 140);
      // Horizontal rails
      const railYs = [190, 310, 430];
      for (const ry of railYs) {
        this.ctx.fillStyle = '#242434';
        this.ctx.fillRect(sx - 22, ry, 82, 9);
        this.ctx.fillStyle = 'rgba(255,255,255,0.04)';
        this.ctx.fillRect(sx - 22, ry, 82, 1);
        // Boxes on rail — varied colours and heights
        const bh = 75 + ((ry * 7) % 25);
        this.ctx.fillStyle = '#281c1c';
        this.ctx.fillRect(sx - 18, ry + 9, 52, bh);
        this.ctx.fillStyle = 'rgba(0,200,255,0.07)';
        this.ctx.fillRect(sx - 18, ry + 9, 52, 7);
      }
    }

    // Small-company assembly stations: employees build, test, and package PCs.
    this.drawCompanyAssemblyFloor(gY);

    this.drawDistantForklift(gY);
  }

  private drawDistantForklift(gY: number) {
    // Distant forklift silhouette moving slowly through the warehouse.
    const forkOffset = -(this.distance * 0.03) % 1800;
    const fx = forkOffset + 1200;
    // Body
    this.ctx.fillStyle = '#161620';
    this.ctx.fillRect(fx, gY - 85, 65, 85);
    // Cab roof
    this.ctx.fillStyle = '#1a1a2a';
    this.ctx.fillRect(fx + 5, gY - 100, 45, 18);
    // Cab window
    this.ctx.fillStyle = '#0a0a18';
    this.ctx.fillRect(fx + 10, gY - 97, 30, 14);
    this.ctx.fillStyle = 'rgba(80,120,255,0.08)';
    this.ctx.fillRect(fx + 10, gY - 97, 30, 14);
    // Counterweight bump
    this.ctx.fillStyle = '#121218';
    this.ctx.fillRect(fx - 12, gY - 40, 16, 40);
    // Mast
    this.ctx.fillStyle = '#1a1a26';
    this.ctx.fillRect(fx + 60, gY - 115, 10, 115);
    this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
    this.ctx.fillRect(fx + 61, gY - 115, 2, 115);
    // Forks
    this.ctx.fillStyle = '#1c1c26';
    this.ctx.fillRect(fx + 60, gY - 108, 36, 6);
    this.ctx.fillRect(fx + 60, gY - 72, 36, 6);
    // Wheels
    this.ctx.fillStyle = '#0c0c14';
    this.ctx.beginPath(); this.ctx.arc(fx + 14, gY - 6, 10, 0, Math.PI * 2); this.ctx.fill();
    this.ctx.beginPath(); this.ctx.arc(fx + 50, gY - 6, 10, 0, Math.PI * 2); this.ctx.fill();
  }

  private drawCompanyAssemblyFloor(gY: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const stationY = gY - 156;
    const scroll = (this.distance * 0.24) % 360;
    const employeeColors = ['#4c8fc1', '#b56a9a', '#6eaa78', '#bd8b55'];
    const screenColors = ['#54e0c0', '#7bb7ff', '#df78d1', '#f0c35c'];

    for (let i = -1; i < W / 360 + 3; i++) {
      const x = i * 360 - scroll + 70;
      const employeeColor = employeeColors[Math.abs(i) % employeeColors.length];
      const screenColor = screenColors[Math.abs(i + 1) % screenColors.length];

      // Pegboard and a few labeled parts bins behind the workstation.
      ctx.fillStyle = '#343b52';
      ctx.fillRect(x - 54, stationY - 86, 116, 4);
      ctx.fillStyle = 'rgba(130, 149, 181, 0.35)';
      for (let peg = -42; peg < 52; peg += 16) {
        ctx.fillRect(x + peg, stationY - 77, 3, 3);
        ctx.fillRect(x + peg, stationY - 61, 3, 3);
      }
      ctx.fillStyle = '#694e43';
      ctx.fillRect(x - 50, stationY - 50, 28, 18);
      ctx.fillStyle = '#8b6a54';
      ctx.fillRect(x - 17, stationY - 50, 28, 18);
      ctx.fillStyle = '#53647b';
      ctx.fillRect(x + 16, stationY - 50, 28, 18);
      ctx.fillStyle = '#d5bc72';
      ctx.fillRect(x - 45, stationY - 43, 17, 2);
      ctx.fillRect(x - 12, stationY - 43, 17, 2);
      ctx.fillRect(x + 21, stationY - 43, 17, 2);

      // Employee seated at the station, kept as readable pixel silhouettes.
      ctx.fillStyle = employeeColor;
      ctx.fillRect(x - 8, stationY - 65, 18, 26);
      ctx.fillRect(x - 14, stationY - 46, 30, 7);
      ctx.fillStyle = '#c98f73';
      ctx.beginPath();
      ctx.arc(x + 1, stationY - 76, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#25283a';
      ctx.fillRect(x - 8, stationY - 85, 18, 5);
      ctx.fillRect(x + 6, stationY - 81, 5, 8);
      ctx.strokeStyle = employeeColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 9, stationY - 51);
      ctx.lineTo(x + 27, stationY - 37);
      ctx.stroke();

      // Monitor showing a build/test screen.
      ctx.fillStyle = '#111522';
      ctx.fillRect(x + 28, stationY - 83, 62, 39);
      ctx.fillStyle = '#46546d';
      ctx.fillRect(x + 25, stationY - 87, 68, 4);
      ctx.fillStyle = 'rgba(18, 31, 47, 0.95)';
      ctx.fillRect(x + 33, stationY - 77, 52, 27);
      ctx.fillStyle = screenColor;
      ctx.fillRect(x + 38, stationY - 70, 23, 3);
      ctx.fillRect(x + 38, stationY - 63, 39, 2);
      ctx.fillRect(x + 38, stationY - 57, 29, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 33, stationY - 77, 52, 2);
      ctx.fillStyle = '#4f5a70';
      ctx.fillRect(x + 54, stationY - 44, 10, 6);

      // Workbench, keyboard, tools, and an open PC being assembled.
      ctx.fillStyle = '#704b37';
      ctx.fillRect(x - 76, stationY - 37, 190, 8);
      ctx.fillStyle = '#a3754d';
      ctx.fillRect(x - 76, stationY - 37, 190, 2);
      ctx.fillStyle = '#4a3540';
      ctx.fillRect(x - 66, stationY - 29, 7, 66);
      ctx.fillRect(x + 96, stationY - 29, 7, 66);
      ctx.fillStyle = '#cad0d2';
      ctx.fillRect(x - 32, stationY - 47, 31, 5);
      ctx.fillStyle = '#697487';
      ctx.fillRect(x - 27, stationY - 45, 3, 2);
      ctx.fillRect(x - 19, stationY - 45, 3, 2);
      ctx.fillRect(x - 11, stationY - 45, 3, 2);

      // Tower under the bench with an open side panel and status light.
      ctx.fillStyle = '#202638';
      ctx.fillRect(x + 35, stationY - 27, 42, 59);
      ctx.fillStyle = '#0e131f';
      ctx.fillRect(x + 41, stationY - 20, 28, 39);
      ctx.strokeStyle = '#65748b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 41, stationY - 20, 28, 39);
      ctx.fillStyle = screenColor;
      ctx.fillRect(x + 46, stationY - 14, 5, 5);
      ctx.fillStyle = '#d2a74a';
      ctx.fillRect(x + 58, stationY - 14, 5, 2);
      ctx.fillStyle = '#8895ab';
      ctx.fillRect(x + 47, stationY + 2, 4, 4);
      ctx.fillRect(x + 58, stationY + 2, 4, 4);

      // Shipping label and order queue placard make the company feel small and local.
      ctx.fillStyle = '#d8c992';
      ctx.fillRect(x - 69, stationY + 12, 28, 19);
      ctx.fillStyle = '#65594b';
      ctx.fillRect(x - 65, stationY + 16, 19, 2);
      ctx.fillRect(x - 65, stationY + 21, 13, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.fillRect(x - 66, stationY + 26, 20, 1);
      ctx.fillStyle = '#405b71';
      ctx.fillRect(x + 112, stationY - 23, 42, 23);
      ctx.fillStyle = '#d4c58a';
      ctx.fillRect(x + 117, stationY - 17, 31, 2);
      ctx.fillRect(x + 117, stationY - 11, 25, 2);
      ctx.fillStyle = '#91d9c1';
      ctx.fillRect(x + 117, stationY - 5, 15, 2);
    }

    // A hand-painted sign for the three-person shop's daily workflow.
    const signX = (-(this.distance * 0.12) % 620) + 410;
    ctx.fillStyle = '#80633f';
    ctx.fillRect(signX, 94, 178, 31);
    ctx.fillStyle = '#e3c779';
    ctx.fillRect(signX + 5, 99, 168, 21);
    ctx.font = '6px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3b3540';
    ctx.fillText('BUILD  //  TEST  //  SHIP', signX + 13, 112);
  }

  private drawHUD() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;

    // ── TOP-LEFT PANEL ─────────────────────────────
    const panelW = 300, panelH = 72, panelX = 14, panelY = 14;
    // Frosted panel
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(0,255,204,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    // Corner accent
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(panelX, panelY + 10); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + 10, panelY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(panelX + panelW - 10, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + 10); ctx.stroke();

    // Score label
    ctx.font = '9px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('SCORE', panelX + 10, panelY + 8);
    ctx.font = '15px "Press Start 2P"';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.3)'; ctx.shadowBlur = 8;
    ctx.fillText(this.score.toLocaleString(), panelX + 10, panelY + 22);
    ctx.shadowBlur = 0;

    // CUDA Cores
    ctx.font = '9px "Press Start 2P"';
    ctx.fillStyle = 'rgba(0,255,204,0.5)';
    ctx.fillText('CUDA CORES', panelX + 10, panelY + 44);
    ctx.font = '11px "Press Start 2P"';
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 10;
    ctx.fillText(this.getFormattedCudaCores(this.cudaCores), panelX + 10, panelY + 56);
    ctx.shadowBlur = 0;

    // ── TOP-RIGHT PANEL ─────────────────────────────
    const rPanelW = 200, rPanelX = W - 14 - rPanelW;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(rPanelX, panelY, rPanelW, panelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rPanelX, panelY, rPanelW, panelH);
    // Corner accent
    ctx.strokeStyle = 'rgba(180,180,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rPanelX + rPanelW - 10, panelY); ctx.lineTo(rPanelX + rPanelW, panelY); ctx.lineTo(rPanelX + rPanelW, panelY + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rPanelX, panelY + 10); ctx.lineTo(rPanelX, panelY); ctx.lineTo(rPanelX + 10, panelY); ctx.stroke();

    ctx.font = '9px "Press Start 2P"';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('DISTANCE', W - 24, panelY + 8);
    ctx.font = '15px "Press Start 2P"';
    ctx.fillStyle = '#e0e8ff';
    ctx.shadowColor = 'rgba(150,180,255,0.5)'; ctx.shadowBlur = 8;
    ctx.fillText(`${Math.floor(this.distance)}m`, W - 24, panelY + 22);
    ctx.shadowBlur = 0;
    // Speed bar
    const speedPct = Math.min(1, (this.speed - 7.5) / 12);
    const barTotalW = rPanelW - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(rPanelX + 10, panelY + 48, barTotalW, 6);
    const barColor = speedPct > 0.7 ? '#ff4444' : speedPct > 0.4 ? '#ffaa00' : '#4488ff';
    ctx.fillStyle = barColor;
    ctx.shadowColor = barColor; ctx.shadowBlur = 6;
    ctx.fillRect(rPanelX + 10, panelY + 48, barTotalW * speedPct + 4, 6);
    ctx.shadowBlur = 0;
    ctx.font = '7px "Press Start 2P"';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(this.jameoCookieTimer > 0 ? '70× VELOCITY' : 'VELOCITY', W - 24, panelY + 60);

    // ── BOTTOM-LEFT ─────────────────────────────────
    const nitMultHUD = 1.0 + this.flopsCollected * 0.09;
    let baseVal = Math.floor(1 + Math.pow(this.distance / 100, 1.8));
    let mult = 1.0;
    if (this.supernovaActive) mult = 250.0;
    else if (this.scarletRushActive) mult = 75.0;
    else if (this.megaBoostActive) mult = 50.0;
    else if (this.boosterActive) mult = 2.0;
    if (this.jameoCookieTimer > 0) mult *= JAMEO_COOKIE_CORE_MULTIPLIER;

    const blX = 14, blY = H - 14;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';

    if (this.flopsCollected > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(blX, blY - 38, 310, 40);
      ctx.strokeStyle = 'rgba(170,0,255,0.4)';
      ctx.lineWidth = 1; ctx.strokeRect(blX, blY - 38, 310, 40);
      ctx.font = '9px "Press Start 2P"';
      ctx.fillStyle = '#aa00ff';
      ctx.shadowColor = '#aa00ff'; ctx.shadowBlur = 8;
      ctx.fillText(`FLOPS x${this.flopsCollected}  ×${nitMultHUD.toFixed(2)} BOOST`, blX + 10, blY - 24);
      ctx.shadowBlur = 0;
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = 'rgba(0,255,204,0.7)';
      ctx.fillText(`PICKUP VALUE: ${Math.floor(baseVal * mult * nitMultHUD).toLocaleString()}`, blX + 10, blY - 8);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(blX, blY - 22, 260, 24);
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = 'rgba(0,255,204,0.7)';
      ctx.fillText(`PICKUP VALUE: ${Math.floor(baseVal * mult * nitMultHUD).toLocaleString()}`, blX + 8, blY - 6);
    }

    // ── POWERUP INDICATORS (right side) ─────────────
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    let yOff = panelY + panelH + 10;
    const MAXDUR: Record<string, number> = {
      'JAMEO COOKIE': JAMEO_COOKIE_DURATION_MS,
      'SUPERNOVA': 10000, 'SCARLET RUSH': 4000, 'JET SURGE': 10000,
      'MEGA BOOST': 10000, 'JUMP BOOST': 17000, 'BOOSTER': 8000, 'MAGNET': 5000
    };

    const drawPowerupBar = (label: string, color: string, timer: number, maxDur: number) => {
      const pBarW = 210, pBarH = 26;
      const pX = W - 14 - pBarW;
      const pct = Math.max(0, timer / maxDur);
      const secs = Math.ceil(timer / 1000);

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(pX, yOff, pBarW, pBarH);
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 1;
      ctx.strokeRect(pX, yOff, pBarW, pBarH);

      // Progress fill
      ctx.fillStyle = color + '33';
      ctx.fillRect(pX, yOff, pBarW * pct, pBarH);

      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 6;
      ctx.textAlign = 'left';
      ctx.fillText(label, pX + 8, yOff + 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${secs}s`, W - 22, yOff + 9);
      ctx.shadowBlur = 0;
      yOff += pBarH + 4;
    };

    if (this.jameoCookieTimer > 0) drawPowerupBar('JAMEO 70× / 5000×', '#ff8a24', this.jameoCookieTimer, MAXDUR['JAMEO COOKIE']);
    if (this.supernovaActive)   drawPowerupBar('SUPERNOVA 250×', '#ff44cc', this.supernovaTimer, MAXDUR['SUPERNOVA']);
    if (this.scarletRushActive) drawPowerupBar('SCARLET RUSH 75×', '#9400d3', this.scarletRushTimer, MAXDUR['SCARLET RUSH']);
    if (this.jetSurgeActive)    drawPowerupBar('JET SURGE', '#ff6600', this.jetSurgeTimer, MAXDUR['JET SURGE']);
    if (this.megaBoostActive)   drawPowerupBar('MEGA BOOST 50×', '#00ff44', this.megaBoostTimer, MAXDUR['MEGA BOOST']);
    if (this.jumpBoostActive)   drawPowerupBar('JUMP BOOST', '#ff44ff', this.jumpBoostTimer, MAXDUR['JUMP BOOST']);
    if (this.boosterActive)     drawPowerupBar('BOOSTER 2×', '#ff8800', this.boosterTimer, MAXDUR['BOOSTER']);
    if (this.magnetActive)      drawPowerupBar('MAGNET', '#ff0044', this.magnetTimer, MAXDUR['MAGNET']);
  }

  private drawLotusMarker() {
    if (!this.lotusCheckpoint) return;

    const ctx = this.ctx;
    const x = 92;
    const y = this.groundY - 36;
    const sway = Math.sin(this.frameCount * 0.08) * 3;

    // A strange little flower growing on a glowing vine.
    ctx.save();
    ctx.strokeStyle = '#55cc88';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#55ffcc';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, this.groundY);
    ctx.bezierCurveTo(x - 10, y + 18, x + 12, y + 12, x + sway, y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#174f3a';
    ctx.beginPath();
    ctx.ellipse(x - 8, y + 14, 10, 4, -0.35, 0, Math.PI * 2);
    ctx.ellipse(x + 9, y + 7, 9, 4, 0.35, 0, Math.PI * 2);
    ctx.fill();

    const flowerY = y - 6;
    ctx.fillStyle = '#ff66cc';
    ctx.shadowColor = '#ff44cc';
    ctx.shadowBlur = 14;
    for (const [dx, dy, radius] of [[0, -8, 7], [-8, -2, 6], [8, -2, 6], [-4, 5, 6], [4, 5, 6]] as const) {
      ctx.beginPath();
      ctx.arc(x + dx + sway, flowerY + dy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe866';
    ctx.beginPath();
    ctx.arc(x + sway, flowerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

      ctx.font = '7px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8affd2';
    ctx.fillText('LOTUS CHECKPOINT', x + 25, y - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`${Math.floor(this.lotusCheckpoint.distance)}m`, x + 25, y + 5);
    ctx.restore();
  }

  private drawStartScreen() {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // React UI will overlay this, just keep canvas black
  }

  private triggerMeteorShower() {
    this.createParticles(this.canvas.width / 2, 0, '#ff4400', 50);
    for (let i = 0; i < 15; i++) {
      this.entities.push({
        type: 'cuda',
        x: this.canvas.width + (i * 40),
        y: this.groundY - 20 - Math.random() * 200,
        w: CUDA_CORE_WIDTH, h: CUDA_CORE_HEIGHT,
        sparkleTimer: Math.random() * 60
      });
    }
  }

  private spawnObstacle() {
    const w = 40 + Math.random() * 40;
    const h = 40 + Math.random() * 40;
    this.entities.push({
      type: 'obstacle',
      x: this.canvas.width,
      y: this.groundY - h,
      w, h
    });
  }

  private spawnPlatformSection() {
    const platformW = 200 + Math.random() * 100;
    const platformY = this.groundY - 80 - Math.random() * 40; // Just high enough to need a jump but reachable
    
    // Add the platform — 50/50 chance: desk or server rack variant
    // Platforms are 40px tall for room to draw detail
    this.entities.push({
      type: 'platform',
      x: this.canvas.width,
      y: platformY,
      w: platformW,
      h: 40,
      variant: Math.random() < 0.5 ? 'desk' : 'server'
    });

    // Add a big obstacle on the ground underneath the platform that you MUST jump over
    // and land on the platform to survive.
    const obstacleW = 60 + Math.random() * 40;
    this.entities.push({
      type: 'obstacle',
      x: this.canvas.width + (platformW / 2) - (obstacleW / 2),
      y: this.groundY - 60,
      w: obstacleW,
      h: 60
    });
  }

  private spawnFlop() {
    // Nit spawns at varying heights, single item
    const y = this.groundY - 60 - Math.random() * 140;
    this.entities.push({
      type: 'flop',
      x: this.canvas.width,
      y,
      w: 18, h: 18
    });
  }

  private spawnRareCd() {
    const y = this.groundY - 90 - Math.random() * 160;
    this.entities.push({ type: 'rarecd', x: this.canvas.width + 40, y, w: 24, h: 24 });
  }

  private spawnJameoCookie() {
    const size = 52;
    this.entities.push({
      type: 'jameo-cookie',
      x: this.canvas.width + 260,
      y: this.groundY - size,
      w: size,
      h: size,
    });
  }

  private spawnCudaBatch() {
    const yBase = this.groundY - 80 - Math.random() * 120;
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      this.entities.push({
        type: 'cuda',
        x: this.canvas.width + (i * 30),
        y: yBase + Math.sin(i) * 20, // Gentle arc
        w: CUDA_CORE_WIDTH, h: CUDA_CORE_HEIGHT
      });
    }
  }

  private spawnPowerUp(type: string) {
    this.entities.push({
      type: 'powerup',
      powerType: type,
      x: this.canvas.width,
      y: this.groundY - 150 - Math.random() * 100,
      w: 24, h: 24
    });
  }

  private checkCollision(rect1: any, rect2: any) {
    return (
      rect1.x < rect2.x + rect2.w &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.h &&
      rect1.y + rect1.height > rect2.y
    );
  }

  private createParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        size: Math.random() * 4 + 2,
        color,
        life: 1.0
      });
    }
  }

  public getFormattedCudaCores(f: number): string {
    if (f >= 1_000_000_000) return `${(f / 1_000_000_000).toFixed(2)}B`;
    if (f >= 1_000_000) return `${(f / 1_000_000).toFixed(2)}M`;
    if (f >= 1_000) return `${(f / 1_000).toFixed(1)}K`;
    return `${f}`;
  }

  public getMilestoneString(f: number): string {
    if (f >= 1_000_000_000) return "DATACENTER TIER";
    if (f >= 500_000_000) return "CLUSTER TIER";
    if (f >= 100_000_000) return "SERVER TIER";
    if (f >= 50_000_000) return "WORKSTATION TIER";
    if (f >= 10_000_000) return "10M CUDA CORES";
    if (f >= 5_000_000) return "5M CUDA CORES";
    if (f >= 2_000_000) return "2M CUDA CORES";
    if (f >= 1_000_000) return "1M CUDA CORES";
    if (f >= 500_000) return "500K CUDA CORES";
    if (f >= 100_000) return "100K CUDA CORES";
    if (f >= 10_000) return "10K CUDA CORES";
    if (f >= 1_000) return "1K CUDA CORES";
    return "WARMING UP";
  }

  // ── SILICON LOTTERY ──────────────────────────────────────────────────────

  private triggerSiliconLottery() {
    const n = GameEngine.LOTTERY_SLOTS.length;
    const idx = Math.floor(Math.random() * n);
    this.siliconLotteryResult = idx;
    // Calculate angle that places segment idx under the pointer (top = 0 in our frame)
    const baseAngle = idx === 0 ? 0 : (2 * Math.PI - (2 * Math.PI * idx / n));
    this.siliconLotteryFinalAngle = 5 * 2 * Math.PI + baseAngle; // 5 full rotations + land
    this.siliconLotterySpinTotal = 300; // ~5 seconds
    this.siliconLotterySpinFrame = 0;
    this.siliconLotteryEntranceFrame = 0;
    this.siliconLoteryCpuY = -100;
    this.siliconLotteryState = 'entrance';
  }

  private updateSiliconLottery() {
    // 45% chance check every 1620 frames (27s at 60fps), but not in the first 5s
    if (this.siliconLotteryState === 'idle') {
      if (this.frameCount > 300 && this.frameCount % 1620 === 0) {
        if (Math.random() < 0.45) {
          this.triggerSiliconLottery();
          return;
        }
      }
      return;
    }

    if (this.siliconLotteryState === 'entrance') {
      this.siliconLotteryEntranceFrame++;
      const W = this.canvas.width, H = this.canvas.height;
      const wheelCy = H * 0.54;
      const cpuTargetY = wheelCy - 165 - 50;
      this.siliconLoteryCpuY += (cpuTargetY - this.siliconLoteryCpuY) * 0.07;
      if (this.siliconLotteryEntranceFrame >= 100) {
        this.siliconLotteryState = 'spinning';
        this.siliconLotterySpinFrame = 0;
      }
    }

    if (this.siliconLotteryState === 'spinning') {
      this.siliconLotterySpinFrame++;
      const t = Math.min(1, this.siliconLotterySpinFrame / this.siliconLotterySpinTotal);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      this.siliconLotteryWheelAngle = this.siliconLotteryFinalAngle * eased;
      if (this.siliconLotterySpinFrame >= this.siliconLotterySpinTotal) {
        this.siliconLotteryWheelAngle = this.siliconLotteryFinalAngle;
        this.siliconLotteryState = 'result';
        this.siliconLotteryResultTimer = 160;
        this.playSound('powerup');
      }
    }

    if (this.siliconLotteryState === 'result') {
      this.siliconLotteryResultTimer--;
      if (this.siliconLotteryResultTimer <= 0) {
        const slot = GameEngine.LOTTERY_SLOTS[this.siliconLotteryResult];
        this.activatePowerupByType(slot.type);
        this.siliconLotteryState = 'idle';
        this.siliconLotteryEntranceFrame = 0;
        this.siliconLoteryCpuY = -100;
        this.siliconLotteryWheelAngle = 0;
      }
    }
  }

  private activatePowerupByType(type: string) {
    if (type === 'magnet')      { this.magnetActive = true;     this.magnetTimer     = 5000;  }
    else if (type === 'booster')     { this.boosterActive = true;    this.boosterTimer    = 8000;  }
    else if (type === 'megaboost')   { this.megaBoostActive = true;  this.megaBoostTimer  = 10000; }
    else if (type === 'jumpboost')   { this.jumpBoostActive = true;  this.jumpBoostTimer  = 17000; }
    else if (type === 'scarletrush') { this.scarletRushActive = true;this.scarletRushTimer= 4000;  }
    else if (type === 'jetsurge')    { this.jetSurgeActive = true;   this.jetSurgeTimer   = 10000; }
    else if (type === 'supernova')   { this.supernovaActive = true;  this.supernovaTimer  = 10000; }
    else if (type === 'teleport')    {
      this.distance += 800;
      this.teleportActive = true;
      this.teleportFlashTimer = 300;
    }
  }

  private drawGoldenCPU(cx: number, cy: number, size: number) {
    const ctx = this.ctx;
    const half = size / 2;
    const pinCount = 5;
    const pinLen = size * 0.2;
    const pinW = size * 0.07;
    const pinSpacing = (size - pinW * 2) / (pinCount - 1);

    ctx.save();
    ctx.translate(cx, cy);

    // Glow
    ctx.shadowBlur = 28; ctx.shadowColor = '#ffd700';

    // Body gradient
    const bodyG = ctx.createLinearGradient(-half, -half, half, half);
    bodyG.addColorStop(0, '#ffe87a');
    bodyG.addColorStop(0.45, '#ffd700');
    bodyG.addColorStop(1, '#a07800');
    ctx.fillStyle = bodyG;
    ctx.fillRect(-half, -half, size, size);

    // Inner chip die
    const dieS = size * 0.52;
    const dieH = dieS / 2;
    const dieG = ctx.createLinearGradient(-dieH, -dieH, dieH, dieH);
    dieG.addColorStop(0, '#c8a000');
    dieG.addColorStop(1, '#7a5a00');
    ctx.fillStyle = dieG;
    ctx.fillRect(-dieH, -dieH, dieS, dieS);
    // Die surface
    ctx.fillStyle = '#b8920a';
    ctx.fillRect(-dieH + 2, -dieH + 2, dieS - 4, dieS - 4);
    // Circuit traces on die
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,220,60,0.55)';
    ctx.lineWidth = 1;
    const dieInner = dieH - 4;
    ctx.beginPath();
    ctx.moveTo(-dieInner, 0); ctx.lineTo(dieInner, 0);
    ctx.moveTo(0, -dieInner); ctx.lineTo(0, dieInner);
    ctx.moveTo(-dieInner, -dieInner / 2); ctx.lineTo(-dieInner / 2, -dieInner / 2); ctx.lineTo(-dieInner / 2, -dieInner);
    ctx.moveTo(dieInner, dieInner / 2);  ctx.lineTo(dieInner / 2, dieInner / 2);   ctx.lineTo(dieInner / 2, dieInner);
    ctx.stroke();
    // Die label
    ctx.font = `bold ${Math.floor(size * 0.14)}px "Press Start 2P"`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.shadowBlur = 4; ctx.shadowColor = '#ffd700';
    ctx.fillText('CPU', 0, 0);
    ctx.shadowBlur = 0;

    // Pins
    ctx.fillStyle = '#ffd700';
    ctx.shadowBlur = 5; ctx.shadowColor = '#ffc000';
    for (let p = 0; p < pinCount; p++) {
      const off = -half + pinW + p * pinSpacing;
      ctx.fillRect(off - pinW / 2, -half - pinLen, pinW, pinLen);  // top
      ctx.fillRect(off - pinW / 2, half, pinW, pinLen);             // bottom
      ctx.fillRect(-half - pinLen, off - pinW / 2, pinLen, pinW);   // left
      ctx.fillRect(half, off - pinW / 2, pinLen, pinW);             // right
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawSiliconLottery() {
    if (this.siliconLotteryState === 'idle') return;

    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2;
    const cy = H * 0.54;         // wheel centre
    const radius = 160;
    const slots = GameEngine.LOTTERY_SLOTS;
    const n = slots.length;
    const segAngle = (2 * Math.PI) / n;

    // Entrance progress (0→1 over 60 frames)
    const ep = Math.min(1, this.siliconLotteryEntranceFrame / 60);

    // Dark overlay fades in
    ctx.fillStyle = `rgba(0,0,8,${ep * 0.88})`;
    ctx.fillRect(0, 0, W, H);

    // Golden border frame
    if (ep > 0.3) {
      const fa = Math.min(1, (ep - 0.3) / 0.5);
      ctx.globalAlpha = fa;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12; ctx.shadowColor = '#ffd700';
      ctx.strokeRect(30, 30, W - 60, H - 60);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Title
    if (ep > 0.2) {
      const ta = Math.min(1, (ep - 0.2) / 0.5);
      ctx.globalAlpha = ta;
      ctx.font = '20px "Press Start 2P"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowBlur = 22; ctx.shadowColor = '#ffd700';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('// SILICON LOTTERY //', cx, 55);
      ctx.shadowBlur = 0;
      ctx.font = '9px "Press Start 2P"';
      ctx.fillStyle = 'rgba(255,215,0,0.55)';
      ctx.fillText('EQUAL CHANCE FOR ALL POWERUPS', cx, 85);
      ctx.globalAlpha = 1;
    }

    // CPU icon (entrance & all subsequent states)
    this.drawGoldenCPU(cx, this.siliconLoteryCpuY, 72);

    // Wheel — show during spinning and result
    if (this.siliconLotteryState === 'spinning' || this.siliconLotteryState === 'result') {
      // Outer decorative ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,0,0.25)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Segments
      for (let i = 0; i < n; i++) {
        const slot = slots[i];
        const startA = -Math.PI / 2 + this.siliconLotteryWheelAngle + segAngle * i;
        const endA   = startA + segAngle;
        const isWinner = this.siliconLotteryState === 'result' && i === this.siliconLotteryResult;
        const flash = isWinner
          ? (Math.floor(this.siliconLotteryResultTimer / 7) % 2 === 0 ? 1.0 : 0.45)
          : 1.0;

        // Segment fill
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startA, endA);
        ctx.closePath();
        ctx.fillStyle = isWinner ? slot.color : slot.color + '55';
        ctx.globalAlpha = flash;
        if (isWinner) {
          ctx.shadowBlur = 18; ctx.shadowColor = slot.color;
        }
        ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;

        // Segment divider
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startA, endA);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label — rotated to follow segment centre
        const midA = startA + segAngle / 2;
        const lx = cx + Math.cos(midA) * radius * 0.64;
        const ly = cy + Math.sin(midA) * radius * 0.64;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(midA + Math.PI / 2);
        ctx.font = '7px "Press Start 2P"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = isWinner ? '#ffffff' : 'rgba(255,255,255,0.75)';
        ctx.shadowBlur = isWinner ? 6 : 0; ctx.shadowColor = slot.color;
        ctx.fillText(slot.label, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Centre cap
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      const capG = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 24);
      capG.addColorStop(0, '#ffe87a');
      capG.addColorStop(1, '#a07800');
      ctx.fillStyle = capG;
      ctx.shadowBlur = 12; ctx.shadowColor = '#ffd700';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '6px "Press Start 2P"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3a1a00';
      ctx.fillText('SPIN', cx, cy);

      // Pointer triangle (pointing down into wheel from above)
      const pTipY = cy - radius - 2;
      const pBaseY = cy - radius + 16;
      const pW = 10;
      ctx.beginPath();
      ctx.moveTo(cx, pTipY);
      ctx.lineTo(cx - pW, pBaseY);
      ctx.lineTo(cx + pW, pBaseY);
      ctx.closePath();
      ctx.fillStyle = '#ffd700';
      ctx.shadowBlur = 10; ctx.shadowColor = '#ffd700';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Entrance: faint wheel outline hint (before spinning)
    if (this.siliconLotteryState === 'entrance' && ep > 0.5) {
      const wa = (ep - 0.5) * 0.4;
      ctx.globalAlpha = wa;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Result announcement
    if (this.siliconLotteryState === 'result') {
      const slot = slots[this.siliconLotteryResult];
      const flashOn = Math.floor(this.siliconLotteryResultTimer / 7) % 2 === 0;
      const countdownAlpha = Math.min(1, this.siliconLotteryResultTimer / 30);

      ctx.font = '16px "Press Start 2P"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = flashOn ? slot.color : '#ffffff';
      ctx.shadowBlur = 24; ctx.shadowColor = slot.color;
      ctx.fillText(`YOU GOT: ${slot.label}!`, cx, cy + radius + 28);
      ctx.shadowBlur = 0;

      // "Resuming..." countdown
      ctx.globalAlpha = 1 - countdownAlpha;
      ctx.font = '8px "Press Start 2P"';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('RESUMING...', cx, cy + radius + 58);
      ctx.globalAlpha = 1;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private gameOver() {
    this.triggerScreenShake(14, 400);
    this.chromaTimer = 350;
    this.chromaIntensity = 12;

    if (this.raceMode && this.raceLivesRemaining > 0) {
      this.raceLivesRemaining--;
      this.callbacks.onRaceLifeLost?.(
        Math.floor(this.distance),
        Math.floor(this.cudaCores),
        this.raceLivesRemaining,
      );
      if (this.raceLivesRemaining > 0) {
        this.respawnAfterHit();
        return;
      }
      this._finalizeGameOver();
      return;
    }

    if (this.revivesAvailable > 0 && this.callbacks.onReviveAvailable) {
      this.revivePending = true;
      this.stopAmbient();
      this.callbacks.onReviveAvailable(
        () => this.acceptRevive(),
        () => this._finalizeGameOver()
      );
      return;
    }

    this._finalizeGameOver();
  }

  public acceptRevive() {
    this.revivesAvailable--;
    this.revivePending = false;
    this.respawnAfterHit();
  }

  private respawnAfterHit() {
    this.reviveInvincTimer = 3000;
    this.state = 'PLAYING';
    this.player.y = this.groundY - this.player.height;
    this.player.vy = 0;
    this.player.isGrounded = true;
    this.entities = this.entities.filter(e => e.type !== 'obstacle' || e.x > this.player.x + 250);
    this.startAmbient();
  }

  public declineRevive() {
    this.revivePending = false;
    this._finalizeGameOver();
  }

  private _finalizeGameOver() {
    this.state = 'GAMEOVER';
    this.stopAmbient();
    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const finalStats = this.buildStats();
    this.rareCdsReported = this.rareCdsCollected;
    this.callbacks.onGameOver(finalStats);
  }
}
