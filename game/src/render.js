// Everything on screen: the city, the cars, the people, the HUD with its
// minimap, and the menus. Warm sunset palette, long shadows, top-down view.
import { WORLD, PLAYER, CAR, COLORS } from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WIN = 'win';

const ROAD_LINES = [];
for (let p = 0; p <= WORLD.size; p += WORLD.roadGap) ROAD_LINES.push(p);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;
    this.time = 0;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
  }

  // World point -> screen point (CSS pixels).
  toScreen(x, y) {
    return {
      x: (x - this.camX) * this.zoom + this.viewW / 2,
      y: (y - this.camY) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.camX,
      y: (sy - this.viewH / 2) / this.zoom + this.camY,
    };
  }

  draw(state) {
    const { world, player, missions, screen, input } = state;
    this.time = world.time;
    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    if (screen === SCREEN_TITLE) {
      this.drawTitle(state);
      return;
    }
    // Camera follows the player; zoom out a little while driving fast.
    const targetZoom = player.driving ? clamp(1.05 - Math.abs(player.speed) / 2400, 0.82, 1.0) : 1.0;
    this.zoom += (targetZoom - this.zoom) * 0.05;
    this.camX = player.x;
    this.camY = player.y;
    this.drawWorld(world);
    this.drawPickups(world);
    this.drawCars(world, player);
    this.drawPeds(world);
    this.drawPlayer(world, player);
    this.drawParticles(world);
    this.drawFloaters(world);
    this.drawObjectiveArrow(world, player, missions);
    this.drawHud(state);
    this.drawMinimap(state);
    if (missions.messageTimer > 0 && missions.message) this.drawBanner(missions.message);
    if (screen === SCREEN_PAUSE) this.drawPause(state);
    if (screen === SCREEN_OVER) this.drawEnd(state, 'WASTED', 'The city got the better of you. The hospital patched you up — minus $200.');
    if (screen === SCREEN_BUSTED) this.drawEnd(state, 'BUSTED', 'The Cinder Bay PD took you in. Bail cost you $300.');
    if (screen === SCREEN_WIN) this.drawEnd(state, 'CINDER BAY IS YOURS', 'Every job done. Rocco trusts you with the city now.');
  }

  drawWorld(world) {
    const ctx = this.ctx;
    const z = this.zoom;
    const view = {
      x0: this.camX - this.viewW / 2 / z - 80,
      y0: this.camY - this.viewH / 2 / z - 80,
      x1: this.camX + this.viewW / 2 / z + 80,
      y1: this.camY + this.viewH / 2 / z + 80,
    };
    // Ground.
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    const toS = (x, y) => this.toScreen(x, y);
    // Beach and water along the south edge.
    if (view.y1 > WORLD.beachTop) {
      const s0 = toS(0, WORLD.beachTop);
      const s1 = toS(0, WORLD.waterTop);
      ctx.fillStyle = COLORS.sand;
      ctx.fillRect(0, s0.y, this.viewW, (s1.y - s0.y) * z);
      const wave = Math.sin(world.time * 1.4) * 4;
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(0, s1.y + wave, this.viewW, this.viewH - s1.y);
      ctx.fillStyle = COLORS.waterDeep;
      for (let i = 0; i < 5; i += 1) {
        const wy = s1.y + 30 + i * 34 + wave * (i % 2 ? 1 : -1);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(0, wy, this.viewW, 3);
      }
      ctx.globalAlpha = 1;
    }
    // Parks.
    for (const park of world.parks) {
      if (park.x > view.x1 || park.x + park.w < view.x0 || park.y > view.y1 || park.y + park.h < view.y0) continue;
      const s = toS(park.x, park.y);
      ctx.fillStyle = park.plaza ? '#8fbf6f' : '#6da34f';
      ctx.fillRect(s.x, s.y, park.w * z, park.h * z);
      ctx.fillStyle = '#5d8f43';
      for (let i = 0; i < 6; i += 1) {
        const tx = park.x + 40 + ((i * 97) % (park.w - 80));
        const ty = park.y + 40 + ((i * 61) % (park.h - 80));
        const ts = toS(tx, ty);
        ctx.beginPath();
        ctx.arc(ts.x, ts.y, 12 * z, 0, Math.PI * 2);
        ctx.fill();
      }
      if (park.plaza) {
        const c = toS(park.x + park.w / 2, park.y + park.h / 2);
        ctx.fillStyle = '#e8dcc3';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 26 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4fa8a0';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 14 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Roads: asphalt, edge lines, dashed centre lines.
    ctx.fillStyle = COLORS.road;
    for (const line of ROAD_LINES) {
      if (line > view.x0 - 100 && line < view.x1 + 100) {
        const s = toS(line - WORLD.roadWidth / 2, 0);
        ctx.fillRect(s.x, 0, WORLD.roadWidth * z, this.viewH);
      }
      if (line > view.y0 - 100 && line < view.y1 + 100) {
        const s = toS(0, line - WORLD.roadWidth / 2);
        ctx.fillRect(0, s.y, this.viewW, WORLD.roadWidth * z);
      }
    }
    ctx.fillStyle = '#e8d44d';
    for (const line of ROAD_LINES) {
      // Vertical centre dashes.
      if (line > view.x0 - 60 && line < view.x1 + 60) {
        for (let y = 0; y < WORLD.size; y += 64) {
          if (y < view.y0 || y > view.y1) continue;
          const s = toS(line, y);
          ctx.fillRect(s.x - 2 * z, s.y, 4 * z, 26 * z);
        }
      }
      if (line > view.y0 - 60 && line < view.y1 + 60) {
        for (let x = 0; x < WORLD.size; x += 64) {
          if (x < view.x0 || x > view.x1) continue;
          const s = toS(x, line);
          ctx.fillRect(s.x, s.y - 2 * z, 26 * z, 4 * z);
        }
      }
    }
    // Sidewalk borders around blocks.
    ctx.strokeStyle = COLORS.sidewalk;
    ctx.lineWidth = 4 * z;
    for (let bx = 0; bx < 8; bx += 1) {
      for (let by = 0; by < 8; by += 1) {
        const x0 = bx * WORLD.roadGap + WORLD.roadWidth / 2;
        const y0 = by * WORLD.roadGap + WORLD.roadWidth / 2;
        const x1 = (bx + 1) * WORLD.roadGap - WORLD.roadWidth / 2;
        const y1 = (by + 1) * WORLD.roadGap - WORLD.roadWidth / 2;
        if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) continue;
        if (y0 > WORLD.beachTop) continue;
        const s = toS(x0, y0);
        ctx.strokeRect(s.x, s.y, (x1 - x0) * z, (y1 - y0) * z);
      }
    }
    // Buildings: long sunset shadows, walls, roof, windows.
    for (const b of world.buildings) {
      if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
      const s = toS(b.x, b.y);
      const w = b.w * z;
      const h = b.h * z;
      const sh = b.height * 0.55 * z;
      ctx.fillStyle = 'rgba(60,30,10,0.28)';
      ctx.fillRect(s.x + sh * 0.7, s.y + sh * 0.7, w, h);
      ctx.fillStyle = b.color;
      ctx.fillRect(s.x, s.y, w, h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(s.x + 6 * z, s.y + 6 * z, w - 12 * z, h - 12 * z);
      ctx.fillStyle = 'rgba(255,244,200,0.75)';
      const cols = b.windows;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          const wx = s.x + 14 * z + (i * (w - 28 * z)) / Math.max(1, cols - 1 || 1);
          const wy = s.y + 16 * z + j * (h - 40 * z);
          ctx.fillRect(wx, wy, 8 * z, 10 * z);
        }
      }
    }
    // Warm sunset tint over everything.
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, 'rgba(255,170,80,0.05)');
    grad.addColorStop(1, 'rgba(255,120,60,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  drawPickups(world) {
    const ctx = this.ctx;
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const s = this.toScreen(pk.x, pk.y + Math.sin(pk.bob) * 3);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = pk.kind === 'health' ? '#2ecc71' : pk.kind === 'cash' ? '#ffd166' : '#e67e22';
      ctx.beginPath();
      ctx.arc(0, 0, 13 * this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${13 * this.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'cash' ? '$' : 'A', 0, 1);
      ctx.restore();
    }
  }

  drawCarShape(car, isPlayer) {
    const ctx = this.ctx;
    const z = this.zoom;
    const s = this.toScreen(car.x, car.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(-CAR.length / 2 * z + 4, -CAR.width / 2 * z + 5, CAR.length * z, CAR.width * z);
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-CAR.length / 2 * z, -CAR.width / 2 * z, CAR.length * z, CAR.width * z, 8 * z);
    ctx.fill();
    // Windshield + roof.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(-6 * z, -CAR.width / 2 * z + 4 * z, 14 * z, CAR.width * z - 8 * z);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-CAR.length / 2 * z + 6 * z, -CAR.width / 2 * z + 4 * z, 10 * z, CAR.width * z - 8 * z);
    // Wheels.
    ctx.fillStyle = '#111';
    for (const [wx, wy] of [[-20, -16], [20, -16], [-20, 16], [20, 16]]) {
      ctx.fillRect(wx * z - 5 * z, wy * z - 3 * z, 10 * z, 6 * z);
    }
    if (car.kind === 'copcar') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-CAR.length / 2 * z + 4 * z, -CAR.width / 2 * z, 8 * z, CAR.width * z);
      ctx.fillStyle = '#111';
      ctx.font = `bold ${9 * z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 3);
      // Flashing light bar.
      const phase = Math.floor(this.time * 6) % 2 === 0;
      ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
      ctx.beginPath();
      ctx.arc(-4 * z, -CAR.width / 2 * z + 2, 4 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
      ctx.beginPath();
      ctx.arc(6 * z, -CAR.width / 2 * z + 2, 4 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.brakeLight) {
      ctx.fillStyle = '#ff2222';
      ctx.fillRect(-CAR.length / 2 * z, -CAR.width / 2 * z + 2 * z, 4 * z, 6 * z);
      ctx.fillRect(-CAR.length / 2 * z, CAR.width / 2 * z - 8 * z, 4 * z, 6 * z);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-CAR.length / 2 * z - 3, -CAR.width / 2 * z - 3, CAR.length * z + 6, CAR.width * z + 6, 10 * z);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCars(world, player) {
    for (const car of world.cars) {
      this.drawCarShape(car, car === player.car);
    }
  }

  drawPeds(world) {
    const ctx = this.ctx;
    const z = this.zoom;
    for (const ped of world.peds) {
      const s = this.toScreen(ped.x, ped.y);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(3, 4, 10 * z, 6 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body.
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 10 * z, 0, Math.PI * 2);
      ctx.fill();
      // Head.
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 - 2, 6 * z, 0, Math.PI * 2);
      ctx.fill();
      if (ped.kind === 'cop') {
        ctx.fillStyle = '#0e2a47';
        ctx.beginPath();
        ctx.arc(0, 0, 10 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.font = `bold ${8 * z}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('PD', 0, 3);
      }
      if (ped.kind === 'rival') {
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 13 * z, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Health pip for enemies.
      if ((ped.kind === 'rival' || ped.kind === 'cop') && ped.hp < 70) {
        ctx.fillStyle = '#222';
        ctx.fillRect(-12 * z, -20 * z, 24 * z, 4 * z);
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-12 * z, -20 * z, 24 * z * clamp(ped.hp / 70, 0, 1), 4 * z);
      }
      ctx.restore();
    }
  }

  drawPlayer(world, player) {
    if (player.driving) return; // the car shape already marks the player
    const ctx = this.ctx;
    const z = this.zoom;
    const s = this.toScreen(player.x, player.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, 11 * z, 7 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    // Jacket, jeans, head — Danny wears a teal jacket.
    ctx.fillStyle = '#0e7c7b';
    ctx.beginPath();
    ctx.arc(0, 0, 12 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 3, Math.sin(player.angle) * 3 - 2, 7 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 3, Math.sin(player.angle) * 3 - 4, 7 * z, Math.PI, Math.PI * 2);
    ctx.fill();
    // Aim line with the pistol.
    if (player.weapon === 'pistol') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(player.angle) * 14 * z, Math.sin(player.angle) * 14 * z);
      ctx.lineTo(Math.cos(player.angle) * 30 * z, Math.sin(player.angle) * 30 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(world) {
    const ctx = this.ctx;
    for (const p of world.particles) {
      const s = this.toScreen(p.x, p.y);
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size * this.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(world) {
    const ctx = this.ctx;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    for (const f of world.floaters) {
      const s = this.toScreen(f.x, f.y);
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = f.color;
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillText(f.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  drawObjectiveArrow(world, player, missions) {
    if (!missions.marker) return;
    const ctx = this.ctx;
    const m = missions.marker;
    const d = Math.hypot(m.x - player.x, m.y - player.y);
    if (d < 240) {
      // Pulsing beacon on the ground.
      const s = this.toScreen(m.x, m.y);
      const pulse = 18 + Math.sin(world.time * 4) * 6;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, pulse * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,209,102,0.25)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, pulse * this.zoom, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Edge arrow pointing at the off-screen objective.
    const angle = Math.atan2(m.y - player.y, m.x - player.x);
    const cx = this.viewW / 2 + Math.cos(angle) * (Math.min(this.viewW, this.viewH) / 2 - 70);
    const cy = this.viewH / 2 + Math.sin(angle) * (Math.min(this.viewW, this.viewH) / 2 - 70);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(d)}m`, cx, cy + 26);
  }

  drawHud(state) {
    const { player, missions } = state;
    const ctx = this.ctx;
    const pad = 16;
    // Top-left: cash, health, weapon.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#7CFC9A';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    const cashText = `$${player.cash.toLocaleString('en-US')}`;
    ctx.strokeText(cashText, pad, 38);
    ctx.fillText(cashText, pad, 38);
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(pad, 50, 190, 14);
    ctx.fillStyle = player.health > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(pad + 2, 52, 186 * clamp(player.health / PLAYER.maxHealth, 0, 1), 10);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`HP ${Math.ceil(player.health)}`, pad + 6, 61);
    // Weapon + ammo.
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#fff';
    const weaponText = player.weapon === 'pistol'
      ? `PISTOL  ${player.ammo} / ${player.reserveAmmo}${player.reloading > 0 ? '  RELOADING…' : ''}`
      : 'FISTS  (Q to draw pistol)';
    ctx.strokeText(weaponText, pad, 88);
    ctx.fillText(weaponText, pad, 88);
    // Top-right: wanted stars.
    const stars = player.wanted;
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'right';
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    ctx.strokeText(starText, this.viewW - pad - 8, 40);
    ctx.fillStyle = stars > 0 ? '#ffd166' : 'rgba(255,255,255,0.55)';
    ctx.fillText(starText, this.viewW - pad - 8, 40);
    if (stars > 0) {
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ffb703';
      ctx.fillText(stars >= 3 ? 'CINDER BAY PD IS HUNTING YOU' : 'THE LAW IS AFTER YOU', this.viewW - pad - 8, 62);
    }
    // Bottom-left: objective + mission title.
    const mission = missions.current;
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffd166';
    const title = mission ? (missions.active ? mission.title : `NEXT JOB: ${mission.title}`) : 'STORY COMPLETE';
    ctx.strokeText(title, pad, this.viewH - 52);
    ctx.fillText(title, pad, this.viewH - 52);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.strokeText(missions.objective, pad, this.viewH - 30);
    ctx.fillText(missions.objective, pad, this.viewH - 30);
    // Bottom-right: speed + controls hint.
    ctx.textAlign = 'right';
    if (player.driving) {
      const kmh = Math.round(Math.abs(player.speed) * 0.36);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeText(`${kmh}`, this.viewW - pad - 8, this.viewH - 52);
      ctx.fillText(`${kmh}`, this.viewW - pad - 8, this.viewH - 52);
      ctx.font = '12px sans-serif';
      ctx.fillText('km/h — E exit · Space handbrake', this.viewW - pad - 8, this.viewH - 30);
    } else {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('WASD move · Shift sprint · E enter car · Click attack · Q weapon · P pause · N mute', this.viewW - pad - 8, this.viewH - 30);
    }
    // Damage flash.
    if (player.invulnerable > 0.2 && player.health < PLAYER.maxHealth) {
      ctx.fillStyle = 'rgba(255,0,0,0.10)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  drawMinimap(state) {
    const { world, player, missions } = state;
    const ctx = this.ctx;
    const size = 168;
    const x0 = this.viewW - size - 16;
    const y0 = 104;
    const scale = size / WORLD.size;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.78)';
    ctx.fillRect(x0 - 6, y0 - 6, size + 12, size + 12);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 - 6, y0 - 6, size + 12, size + 12);
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    // Water + sand.
    ctx.fillStyle = '#2f7f9e';
    ctx.fillRect(x0, y0 + WORLD.beachTop * scale, size, size);
    ctx.fillStyle = '#e8d5a4';
    ctx.fillRect(x0, y0 + WORLD.beachTop * scale - 8, size, 8);
    // Roads.
    ctx.fillStyle = '#555';
    for (const line of ROAD_LINES) {
      ctx.fillRect(x0, y0 + line * scale - 1, size, 2);
      ctx.fillRect(x0 + line * scale - 1, y0, 2, size);
    }
    // Buildings.
    ctx.fillStyle = '#c9a86a';
    for (const b of world.buildings) {
      ctx.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(1.5, b.w * scale), Math.max(1.5, b.h * scale));
    }
    // Objective marker.
    if (missions.marker) {
      const mx = x0 + missions.marker.x * scale;
      const my = y0 + missions.marker.y * scale;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police blips.
    ctx.fillStyle = '#4da6ff';
    for (const car of world.cars) {
      if (car.kind !== 'copcar') continue;
      ctx.beginPath();
      ctx.arc(x0 + car.x * scale, y0 + car.y * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5b5b';
    for (const ped of world.peds) {
      if (ped.kind !== 'rival') continue;
      ctx.beginPath();
      ctx.arc(x0 + ped.x * scale, y0 + ped.y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = x0 + player.x * scale;
    const py = y0 + player.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CINDER BAY', x0 - 2, y0 - 12);
  }

  drawBanner(text) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 17px sans-serif';
    const w = ctx.measureText(text).width + 36;
    const x = (this.viewW - w) / 2;
    const y = 96;
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.fillRect(x, y, w, 34);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, 34);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(text, this.viewW / 2, y + 22);
    ctx.restore();
  }

  drawTitle(state) {
    const ctx = this.ctx;
    const { player } = state;
    // Sunset sky over the bay.
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, '#2b1a4d');
    grad.addColorStop(0.45, '#c94b6d');
    grad.addColorStop(0.75, '#ff8c42');
    grad.addColorStop(1, '#ffd166');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    // Sun.
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(this.viewW * 0.72, this.viewH * 0.34, 64, 0, Math.PI * 2);
    ctx.fill();
    // Skyline silhouettes.
    ctx.fillStyle = 'rgba(43,26,77,0.85)';
    const base = this.viewH * 0.72;
    const widths = [70, 110, 60, 130, 80, 100, 65, 120, 75, 95];
    let x = -10;
    for (const w of widths) {
      const h = 90 + ((w * 37) % 130);
      ctx.fillRect(x, base - h, w, h + 200);
      x += w + 14;
      if (x > this.viewW) break;
    }
    // Water with a few broken sun-streaks.
    ctx.fillStyle = '#1f5f7d';
    ctx.fillRect(0, base + 60, this.viewW, this.viewH - base - 60);
    ctx.fillStyle = 'rgba(255,209,102,0.45)';
    for (let i = 0; i < 4; i += 1) {
      const sw = 90 - i * 16;
      ctx.fillRect(this.viewW * 0.72 - sw / 2, base + 78 + i * 26, sw, 5);
    }
    // Title.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.font = 'bold 64px Georgia, serif';
    ctx.strokeText('CINDER BAY', this.viewW / 2, this.viewH * 0.30);
    ctx.fillText('CINDER BAY', this.viewW / 2, this.viewH * 0.30);
    ctx.font = 'italic 22px Georgia, serif';
    ctx.fillStyle = '#ffd166';
    ctx.strokeText('a sun-soaked open-world crime story', this.viewW / 2, this.viewH * 0.30 + 38);
    ctx.fillText('a sun-soaked open-world crime story', this.viewW / 2, this.viewH * 0.30 + 38);
    // Menu card.
    const cardW = 520;
    const cardH = 210;
    const cx = (this.viewW - cardW) / 2;
    const cy = this.viewH * 0.52;
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.fillRect(cx, cy, cardW, cardH);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cardW, cardH);
    ctx.fillStyle = '#fff';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    const lines = [
      'You are Danny "Dash" Cole, a courier who just took',
      'one job too many for Rocco Marlowe\'s crew.',
      '',
      'Explore the city on foot or by car. Steal cars, lose',
      'the cops, run five story jobs — and try not to die.',
      '',
      'WASD move / drive · E enter car · Mouse + click fight',
      'Q switch weapon · R reload · P pause · N mute',
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, cx + 24, cy + 30 + i * 20);
    });
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    const blink = Math.floor(this.time * 2) % 2 === 0;
    if (blink) ctx.fillText('— CLICK OR PRESS ENTER TO START —', this.viewW / 2, cy + cardH + 44);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(player.hasSave ? 'Save found — press L to continue your story' : 'No save yet — a new story begins', this.viewW / 2, cy + cardH + 70);
    ctx.fillText('Progress saves automatically at each completed job. (C) Cinder Bay — an original game.', this.viewW / 2, this.viewH - 18);
  }

  drawPause(state) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('PAUSED', this.viewW / 2, this.viewH / 2 - 30);
    ctx.font = '16px sans-serif';
    ctx.fillText('P resume · M mute · R restart story · Esc quit to title', this.viewW / 2, this.viewH / 2 + 10);
    const { player } = state;
    ctx.fillText(`Jobs done: ${player.missionsDone} / 5 · Cash: $${player.cash} · Kills: ${player.kills} · Cars stolen: ${player.carsStolen}`, this.viewW / 2, this.viewH / 2 + 40);
  }

  drawEnd(state, heading, sub) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = heading === 'WASTED' ? '#ff5b5b' : heading === 'BUSTED' ? '#4da6ff' : '#ffd166';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText(heading, this.viewW / 2, this.viewH / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '17px sans-serif';
    ctx.fillText(sub, this.viewW / 2, this.viewH / 2 + 18);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('— CLICK OR PRESS ENTER TO CONTINUE —', this.viewW / 2, this.viewH / 2 + 62);
  }
}
