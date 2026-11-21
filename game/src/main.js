// Cinder Bay — game loop, screens, police response, saving.
// Original open-world crime game: explore on foot and by car, steal cars,
// outrun the police, run five story jobs.
import { Input } from './input.js';
import { World, KIND_COP_CAR } from './world.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { Renderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_OVER, SCREEN_BUSTED, SCREEN_WIN } from './render.js';
import { AudioEngine } from './audio.js';
import { stageShot } from './shots.js';
import { WANTED } from './config.js';
import { clamp, mulberry32 } from './random.js';

const SAVE_KEY = 'cinder-bay-save-v1';
const STEP = 1 / 60;

class FakeInput {
  constructor() {
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false;
  }
  down(code) { return this.keys.has(code); }
  pressed() { return false; }
  moveVector() { return { x: 0, y: 0 }; }
  endFrame() {}
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.fakeInput = new FakeInput();
    this.audio = new AudioEngine();
    this.renderer = new Renderer(canvas);
    this.renderer.resize();
    window.addEventListener('resize', () => this.renderer.resize());
    this.seed = 20261120;
    this.shotMode = null;
    this.reset(this.seed);
    this.screen = SCREEN_TITLE;
    this.lastTime = 0;
    this.accumulator = 0;
    this.bustedProgress = 0;
    this.hasSave = false;
    try {
      this.hasSave = !!localStorage.getItem(SAVE_KEY);
    } catch {
      this.hasSave = false;
    }
    this.player.hasSave = this.hasSave;
    this.statusEl = document.getElementById('status');
  }

  reset(seed) {
    this.world = new World(seed);
    this.player = new Player(this.world);
    this.missions = new MissionManager(this.world, this.player);
    this.bustedProgress = 0;
  }

  // ---- save / load ----
  save() {
    try {
      const data = {
        cash: this.player.cash,
        health: this.player.health,
        x: this.player.x,
        y: this.player.y,
        missionIndex: this.missions.index,
        missionsDone: this.player.missionsDone,
        kills: this.player.kills,
        carsStolen: this.player.carsStolen,
        ammo: this.player.ammo,
        reserveAmmo: this.player.reserveAmmo,
        weapon: this.player.weapon,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.hasSave = true;
    } catch {
      // Storage unavailable (private mode): the game still plays.
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.player.cash = data.cash ?? 250;
      this.player.health = data.health ?? 100;
      this.player.x = data.x ?? 675;
      this.player.y = data.y ?? 760;
      this.missions.index = data.missionIndex ?? 0;
      this.player.missionsDone = data.missionsDone ?? 0;
      this.player.kills = data.kills ?? 0;
      this.player.carsStolen = data.carsStolen ?? 0;
      this.player.ammo = data.ammo ?? 12;
      this.player.reserveAmmo = data.reserveAmmo ?? 48;
      this.player.weapon = data.weapon ?? 'fists';
      this.missions.updateObjective();
      return true;
    } catch {
      return false;
    }
  }

  // ---- police ----
  wantedCopCars() {
    return this.world.cars.filter((c) => c.kind === KIND_COP_CAR).length;
  }

  wantedCopPeds() {
    return this.world.peds.filter((p) => p.kind === 'cop').length;
  }

  spawnPolice() {
    const wanted = this.player.wanted;
    if (wanted === 0) return;
    const wantCars = Math.min(wanted, 4);
    const wantPeds = this.player.driving ? 0 : Math.min(wanted, 3);
    // Spawn off-screen, on a road near the player.
    const spawnPoint = () => {
      const angle = Math.random() * Math.PI * 2;
      const d = 700 + Math.random() * 250;
      let x = clamp(this.player.x + Math.cos(angle) * d, 120, 3480);
      let y = clamp(this.player.y + Math.sin(angle) * d, 120, 3280);
      return { x, y };
    };
    while (this.wantedCopCars() < wantCars) {
      const p = spawnPoint();
      this.world.spawnCopCar(p.x, p.y);
    }
    while (this.wantedCopPeds() < wantPeds) {
      const p = spawnPoint();
      this.world.spawnCopPed(p.x, p.y);
    }
    // Despawn police that fell far behind once the heat is gone.
    if (wanted === 0) {
      this.world.cars = this.world.cars.filter((c) => c.kind !== KIND_COP_CAR || Math.hypot(c.x - this.player.x, c.y - this.player.y) < 900);
    }
  }

  // ---- one fixed step of simulation ----
  step(dt) {
    const input = this.shotMode ? this.fakeInput : this.input;
    const events = { rivalShots: [] };
    const prevHeat = this.player.heat;
    this.player.update(dt, input, events, this.audio);
    this.world.update(dt, this.player, events);
    this.missions.update(dt, events);
    if (events.rivalKilled) this.missions.onRivalKilled();
    // Rival gunfire can hurt the player.
    for (const shot of events.rivalShots) {
      const d = Math.hypot(this.player.x - shot.x, this.player.y - shot.y);
      const hitChance = d < 260 ? 0.5 : 0.25;
      if (Math.random() < hitChance * dt * 8) {
        this.player.hurt(7, events);
        this.world.burst(this.player.x, this.player.y, '#ff5b5b', 4, 80);
      } else {
        this.world.particles.push({
          x: shot.x + Math.cos(shot.angle) * 40, y: shot.y + Math.sin(shot.angle) * 40,
          vx: 0, vy: 0, life: 0.15, maxLife: 0.15, color: '#ffe066', size: 3,
        });
      }
    }
    if (events.copTouch) {
      this.bustedProgress += dt;
      if (this.bustedProgress > 1.2 && !this.player.driving && !this.shotMode) {
        this.screen = SCREEN_BUSTED;
        this.audio.busted();
        this.player.cash = Math.max(0, this.player.cash - 300);
        this.player.heat = 0;
      }
    } else {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 2);
    }
    if (events.copRam && this.player.driving) {
      this.player.hurt(2, events);
    }
    if (events.wasted && !this.shotMode) {
      this.screen = SCREEN_OVER;
      this.player.cash = Math.max(0, this.player.cash - 200);
    }
    if (events.stoleCar) this.audio.blip(220, 0.15, 'square', 0.15);
    if (events.pickup) this.audio.pickup();
    if (events.crash) this.audio.crash();
    if (events.shot) this.audio.gunshot();
    if (events.punch) this.audio.punch();
    if (events.objectiveDone) this.audio.pickup();
    if (events.missionStart) this.audio.missionDone();
    if (events.ranOverPed) this.audio.crash();
    // Police response follows the wanted level, with a short delay.
    if (this.player.wanted > 0 && this.world.time - this.player.lastCrime < 30) {
      this.spawnPolice();
    } else if (this.player.wanted === 0) {
      // Clear the streets once the heat dies.
      this.world.cars = this.world.cars.filter((c) => c.kind !== KIND_COP_CAR);
      this.world.peds = this.world.peds.filter((p) => p.kind !== 'cop');
    }
    if (this.missions.completedAll && this.screen === SCREEN_PLAY) {
      this.screen = SCREEN_WIN;
      this.audio.missionDone();
    }
    // Audio follows the state.
    this.audio.setEngine(this.player.driving ? Math.abs(this.player.speed) / 560 : 0, this.player.driving);
    this.audio.setSiren(this.player.wanted > 0, dt);
    this.audio.musicTick(dt);
    // Aim: the player faces the mouse on foot; in a car the car faces the road.
    if (!this.player.driving && !this.shotMode) {
      const w = this.renderer.screenToWorld(input.mouseX, input.mouseY);
      this.player.angle = Math.atan2(w.y - this.player.y, w.x - this.player.x);
    }
    // Shooting.
    if (!this.shotMode && input.clicked && this.screen === SCREEN_PLAY) {
      const w = this.renderer.screenToWorld(input.mouseX, input.mouseY);
      this.player.shoot(w.x, w.y, events);
    }
    if (this.statusEl) {
      this.statusEl.textContent = `Health ${Math.ceil(this.player.health)}, cash $${this.player.cash}, wanted ${this.player.wanted} stars, job: ${this.missions.objective}`;
    }
  }

  frame(time) {
    const dtMs = Math.min(100, time - (this.lastTime || time));
    this.lastTime = time;
    if (this.screen === SCREEN_PLAY && !this.shotMode) {
      this.accumulator += dtMs / 1000;
      let guard = 0;
      while (this.accumulator >= STEP && guard < 5) {
        this.step(STEP);
        this.accumulator -= STEP;
        guard += 1;
        if (this.screen !== SCREEN_PLAY) break;
      }
      this.handleKeys();
    } else if (this.screen === SCREEN_TITLE) {
      this.world.time += dtMs / 1000;
      this.handleTitleKeys();
    } else {
      this.handleEndKeys();
    }
    this.renderer.draw({
      world: this.world,
      player: this.player,
      missions: this.missions,
      screen: this.screen,
      input: this.input,
    });
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  handleKeys() {
    const input = this.input;
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      this.screen = SCREEN_PAUSE;
      return;
    }
    if (input.pressed('KeyN')) {
      this.audio.ensure();
      this.audio.setMuted(!this.audio.muted);
      this.missions.say(this.audio.muted ? 'Sound muted (N to unmute).' : 'Sound on.', 2);
    }
    if (input.pressed('KeyM')) {
      this.audio.musicOn = !this.audio.musicOn;
      this.missions.say(this.audio.musicOn ? 'Radio on — Cinder Bay FM.' : 'Radio off.', 2);
    }
  }

  handleTitleKeys() {
    const input = this.input;
    const start = input.pressed('Enter') || input.clicked;
    if (start) {
      this.audio.ensure();
      this.audio.musicOn = true;
      this.screen = SCREEN_PLAY;
      this.missions.say('Reach the yellow marker at the garage to start your first job.', 5);
      return;
    }
    if (input.pressed('KeyL') && this.hasSave) {
      this.audio.ensure();
      if (this.load()) {
        this.screen = SCREEN_PLAY;
        this.missions.say('Welcome back to Cinder Bay.', 3);
      }
    }
  }

  handleEndKeys() {
    const input = this.input;
    if (this.screen === SCREEN_PAUSE) {
      if (input.pressed('KeyP') || input.pressed('Escape') || input.clicked) {
        this.screen = SCREEN_PLAY;
      } else if (input.pressed('KeyR')) {
        this.reset(this.seed);
        this.screen = SCREEN_TITLE;
      }
      return;
    }
    if (this.screen === SCREEN_OVER || this.screen === SCREEN_BUSTED) {
      if (input.pressed('Enter') || input.clicked) {
        // Respawn at the hospital / police station, heat cleared.
        this.player.dead = false;
        this.player.health = 100;
        this.player.heat = 0;
        this.player.x = 450;
        this.player.y = 1575; // Bay General hospital, on the road
        this.player.car = null;
        this.world.cars = this.world.cars.filter((c) => c.kind !== KIND_COP_CAR);
        this.world.peds = this.world.peds.filter((p) => p.kind !== 'cop');
        this.screen = SCREEN_PLAY;
        this.save();
      }
      return;
    }
    if (this.screen === SCREEN_WIN) {
      if (input.pressed('Enter') || input.clicked) {
        this.screen = SCREEN_PLAY;
        this.missions.completedAll = false;
        this.save();
      }
    }
  }

  start() {
    // Deterministic screenshot mode: ?shot=cover|street|drive|heist&seed=N
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    const seedParam = Number(params.get('seed') || '1');
    if (shot) {
      this.seed = 1000 + (Number.isFinite(seedParam) ? seedParam : 1);
      this.reset(this.seed);
      this.shotMode = shot;
      // Deterministic staging: every Math.random() call while the scene is
      // played forward draws from the shot's own seeded stream, so the same
      // seed always renders the same frame.
      const realRandom = Math.random;
      Math.random = mulberry32(this.seed);
      const staged = stageShot(shot, this);
      Math.random = realRandom;
      this.screen = staged.screen;
      document.title = `Cinder Bay — shot ${shot}`;
      this.renderer.draw({
        world: this.world,
        player: this.player,
        missions: this.missions,
        screen: this.screen,
        input: this.input,
      });
      return;
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

const canvas = document.getElementById('game');
const game = new Game(canvas);
// Exposed for automated play-testing (and nothing else).
window.__game = game;
game.start();
