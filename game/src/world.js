// The city of Cinder Bay: a seeded grid of roads, blocks and buildings,
// plus the traffic, pedestrians, police and particles that live in it.
// All names, places and art are original to this game.
import {
  WORLD, CAR, TRAFFIC_COUNT, PED_COUNT, WANTED,
  BUILDING_COLORS, ROOF_COLORS, CAR_COLORS, PED_SHIRTS, PLACES,
} from './config.js';
import { mulberry32, pick, range, rangeInt, clamp, angleTo, angleDelta, dist2 } from './random.js';

export const KIND_CAR = 'car';
export const KIND_PED = 'ped';
export const KIND_COP_CAR = 'copcar';
export const KIND_COP = 'cop';
export const KIND_RIVAL = 'rival';

const ROAD_LINES = [];
for (let p = 0; p <= WORLD.size; p += WORLD.roadGap) ROAD_LINES.push(p);

export function isOnRoad(x, y) {
  for (const line of ROAD_LINES) {
    if (Math.abs(x - line) < WORLD.roadWidth / 2 + 6) return true;
    if (Math.abs(y - line) < WORLD.roadWidth / 2 + 6) return true;
  }
  return false;
}

export function nearestRoadLine(value) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) {
    if (Math.abs(value - line) < Math.abs(value - best)) best = line;
  }
  return best;
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.time = 0;
    this.buildings = [];
    this.parks = [];
    this.cars = []; // traffic + parked + police cars
    this.peds = [];
    this.particles = [];
    this.floaters = []; // floating pickup text / cash popups
    this.pickups = []; // health / cash / ammo on the ground
    this.generateCity();
    this.spawnTraffic();
    this.spawnPeds();
    this.spawnPickups();
  }

  generateCity() {
    const rng = this.rng;
    const gap = WORLD.roadGap;
    const inset = WORLD.blockInset;
    const blocks = Math.floor(WORLD.size / gap);
    for (let bx = 0; bx < blocks; bx += 1) {
      for (let by = 0; by < blocks; by += 1) {
        const x0 = bx * gap + inset;
        const y0 = by * gap + inset;
        const x1 = (bx + 1) * gap - inset;
        const y1 = (by + 1) * gap - inset;
        if (y0 > WORLD.beachTop) continue; // beach, no buildings
        // The plaza block in the middle is a park; one more park uptown.
        const isPlaza = bx === 4 && by === 4;
        const isPark = isPlaza || (bx === 1 && by === 5) || (bx === 6 && by === 1);
        if (isPark) {
          this.parks.push({ x: x0 - 20, y: y0 - 20, w: x1 - x0 + 40, h: y1 - y0 + 40, plaza: isPlaza });
          continue;
        }
        const downtown = bx >= 3 && bx <= 5 && by >= 3 && by <= 5;
        const split = rng() < 0.55;
        if (split) {
          const midX = x0 + (x1 - x0) * range(rng, 0.42, 0.58);
          this.addBuilding(x0, y0, midX - x0 - 14, y1 - y0, downtown, rng);
          this.addBuilding(midX + 14, y0, x1 - midX - 14, y1 - y0, downtown, rng);
        } else {
          this.addBuilding(x0, y0, x1 - x0, y1 - y0, downtown, rng);
        }
      }
    }
  }

  addBuilding(x, y, w, h, downtown, rng) {
    const height = downtown ? rangeInt(rng, 26, 64) : rangeInt(rng, 8, 30);
    this.buildings.push({
      x, y, w, h,
      height,
      color: pick(rng, BUILDING_COLORS),
      roof: pick(rng, ROOF_COLORS),
      windows: rangeInt(rng, 2, 5),
    });
  }

  // Circle (player / ped) vs building rectangles. Returns a corrected position.
  collideCircle(x, y, radius) {
    let px = x;
    let py = y;
    for (const b of this.buildings) {
      const cx = clamp(px, b.x, b.x + b.w);
      const cy = clamp(py, b.y, b.y + b.h);
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * radius;
          py = cy + (dy / d) * radius;
        } else {
          py = b.y - radius;
        }
      }
    }
    px = clamp(px, 30, WORLD.size - 30);
    py = clamp(py, 30, WORLD.size - 30);
    return { x: px, y: py };
  }

  // Car (oriented rectangle, approximated by its centre circle) vs buildings.
  collideCar(car) {
    const r = CAR.width / 2 - 2;
    const fixed = this.collideCircle(car.x, car.y, r);
    const hit = fixed.x !== car.x || fixed.y !== car.y;
    car.x = fixed.x;
    car.y = fixed.y;
    return hit;
  }

  spawnTraffic() {
    const rng = this.rng;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      this.cars.push(this.makeTrafficCar(rng, false));
    }
    // Parked cars the player can steal, near the safehouse and garage.
    for (let i = 0; i < 6; i += 1) {
      const car = this.makeTrafficCar(rng, true);
      this.cars.push(car);
    }
  }

  makeTrafficCar(rng, parked) {
    const horizontal = rng() < 0.5;
    const line = pick(rng, ROAD_LINES.slice(1, -1));
    const lane = (rng() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 4);
    const along = range(rng, 200, WORLD.size - 200);
    const dir = rng() < 0.5 ? 1 : -1;
    const car = {
      kind: KIND_CAR,
      x: horizontal ? along : line + lane,
      y: horizontal ? line + lane : along,
      angle: horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: parked ? 0 : range(rng, 55, 115),
      cruise: range(rng, 70, 120),
      color: pick(rng, CAR_COLORS),
      horizontal,
      line,
      dir,
      parked: !!parked,
      driver: !parked,
      id: this.cars.length,
      brakeLight: false,
    };
    if (parked) {
      // Park along a road edge, just off the driving lane.
      car.x = horizontal ? along : line + WORLD.roadWidth / 2 - 16;
      car.y = horizontal ? line + WORLD.roadWidth / 2 - 16 : along;
      car.angle = horizontal ? 0 : Math.PI / 2;
    }
    return car;
  }

  spawnPeds() {
    const rng = this.rng;
    for (let i = 0; i < PED_COUNT; i += 1) {
      const horizontal = rng() < 0.5;
      const line = pick(rng, ROAD_LINES.slice(1, -1));
      const side = (rng() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + WORLD.sidewalk / 2);
      const along = range(rng, 120, WORLD.size - 120);
      this.peds.push({
        kind: KIND_PED,
        x: horizontal ? along : line + side,
        y: horizontal ? line + side : along,
        angle: rng() * Math.PI * 2,
        speed: range(rng, 28, 55),
        shirt: pick(rng, PED_SHIRTS),
        skin: pick(rng, ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
        horizontal,
        line,
        dir: rng() < 0.5 ? 1 : -1,
        state: 'walk',
        panic: 0,
        hp: 30,
        id: this.peds.length,
      });
    }
  }

  spawnPickups() {
    const rng = this.rng;
    const spots = [
      { x: PLACES.plaza.x, y: PLACES.plaza.y, kind: 'health' },
      { x: PLACES.pier.x, y: PLACES.pier.y, kind: 'cash' },
      { x: PLACES.motel.x, y: PLACES.motel.y, kind: 'ammo' },
      { x: PLACES.garage.x + 90, y: PLACES.garage.y, kind: 'health' },
      { x: PLACES.docks.x - 120, y: PLACES.docks.y, kind: 'ammo' },
    ];
    for (const s of spots) {
      this.pickups.push({ ...s, taken: false, bob: rng() * Math.PI * 2 });
    }
  }

  spawnCopCar(x, y) {
    const car = {
      kind: KIND_COP_CAR,
      x, y,
      angle: angleTo(x, y, 1800, 1800),
      speed: 0,
      cruise: 330,
      color: '#1d3557',
      horizontal: true,
      line: nearestRoadLine(y),
      dir: 1,
      parked: false,
      driver: true,
      id: this.cars.length,
      brakeLight: false,
      siren: true,
    };
    this.cars.push(car);
    return car;
  }

  spawnCopPed(x, y) {
    const cop = {
      kind: KIND_COP,
      x, y,
      angle: angleTo(x, y, 1800, 1800),
      speed: 150,
      shirt: '#1d3557',
      skin: '#e0ac69',
      horizontal: false,
      line: 0,
      dir: 1,
      state: 'chase',
      panic: 0,
      hp: 60,
      id: this.peds.length,
    };
    this.peds.push(cop);
    return cop;
  }

  spawnRival(x, y) {
    const rival = {
      kind: KIND_RIVAL,
      x, y,
      angle: 0,
      speed: 95,
      shirt: '#7b1e1e',
      skin: '#f1c27d',
      horizontal: false,
      line: 0,
      dir: 1,
      state: 'guard',
      panic: 0,
      hp: 70,
      shootCooldown: 1,
      id: this.peds.length,
    };
    this.peds.push(rival);
    return rival;
  }

  burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = (speed || 120) * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9, color, size: 2 + Math.random() * 3,
      });
    }
  }

  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color: color || '#ffd166', life: 1.4 });
  }

  update(dt, player, events) {
    this.time += dt;
    this.updateTraffic(dt, player, events);
    this.updatePeds(dt, player, events);
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      f.y -= 26 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    for (const pk of this.pickups) pk.bob += dt * 3;
  }

  updateTraffic(dt, player, events) {
    const playerCar = player.car;
    for (const car of this.cars) {
      if (car === playerCar) continue;
      if (car.parked) continue;
      if (car.kind === KIND_COP_CAR) {
        this.updateCopCar(dt, car, player, events);
        continue;
      }
      // Civilian traffic: cruise along its road, slow for the car ahead,
      // sometimes turn at an intersection.
      let target = car.cruise;
      for (const other of this.cars) {
        if (other === car || other.parked) continue;
        const ahead = this.aheadDistance(car, other);
        if (ahead !== null && ahead < 90) target = Math.min(target, 30);
      }
      if (playerCar && this.aheadDistance(car, playerCar) < 100) target = Math.min(target, 25);
      if (!playerCar && player.onFoot) {
        const d2 = dist2(car.x, car.y, player.x, player.y);
        if (d2 < 120 * 120 && this.aheadDistance(car, { x: player.x, y: player.y, angle: 0, horizontal: car.horizontal }) !== null) {
          target = Math.min(target, 0);
        }
      }
      car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
      car.brakeLight = target < car.speed - 5;
      const step = car.speed * dt * car.dir;
      if (car.horizontal) car.x += step;
      else car.y += step;
      // Turn at an intersection sometimes; wrap at the city edge.
      const linePos = car.horizontal ? car.x : car.y;
      const nearLine = ROAD_LINES.some((l) => Math.abs(linePos - l) < 8);
      if (nearLine && Math.random() < dt * 0.12) {
        car.horizontal = !car.horizontal;
        car.line = nearestRoadLine(car.horizontal ? car.y : car.x);
        car.dir = Math.random() < 0.5 ? 1 : -1;
        car.angle = car.horizontal ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const lane = (Math.random() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 4);
        if (car.horizontal) car.y = car.line + lane;
        else car.x = car.line + lane;
      }
      if (car.x < 60 || car.x > WORLD.size - 60 || car.y < 60 || car.y > WORLD.beachTop - 40) {
        // Teleport to the far side of the city instead of despawning visibly.
        const fresh = this.makeTrafficCar(this.rng, false);
        Object.assign(car, fresh, { id: car.id });
      }
      this.collideCar(car);
    }
  }

  // Distance from `car` to `other` straight ahead on the same road, or null.
  aheadDistance(car, other) {
    if (car.horizontal !== (other.horizontal ?? car.horizontal)) {
      // other may be the player: compare along the car's axis only.
      if (other.horizontal === undefined) {
        const along = car.horizontal ? other.x - car.x : other.y - car.y;
        const lateral = car.horizontal ? other.y - car.y : other.x - car.x;
        if (Math.abs(lateral) > 34) return null;
        const forward = car.dir * along;
        return forward > 0 ? forward : null;
      }
      return null;
    }
    const along = car.horizontal ? (other.x - car.x) * car.dir : (other.y - car.y) * car.dir;
    const lateral = car.horizontal ? Math.abs(other.y - car.y) : Math.abs(other.x - car.x);
    if (along <= 0 || lateral > 36) return null;
    return along;
  }

  updateCopCar(dt, car, player, events) {
    // Police drive toward the player along the road grid, faster than traffic.
    const targetAngle = angleTo(car.x, car.y, player.x, player.y);
    const wantHorizontal = Math.abs(player.x - car.x) > Math.abs(player.y - car.y);
    const gridAngle = wantHorizontal
      ? (player.x > car.x ? 0 : Math.PI)
      : (player.y > car.y ? Math.PI / 2 : -Math.PI / 2);
    let steer = angleDelta(car.angle, gridAngle);
    // If very close, aim straight at the player (ramming) — unless the
    // player is on foot, where the car pulls up to make the arrest instead
    // of driving straight through them.
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    if (d < 260) steer = angleDelta(car.angle, targetAngle);
    car.angle += clamp(steer, -2.4 * dt, 2.4 * dt);
    const target = !player.car && d < 90 ? 0 : d < 120 ? 200 : 380;
    car.speed += clamp(target - car.speed, -500 * dt, 300 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (this.collideCar(car)) car.speed *= 0.55;
    // Ram the player's car or knock the player down. The shove applies
    // once per contact, not every step, or the ram would pin both cars.
    if (player.car) {
      if (dist2(car.x, car.y, player.car.x, player.car.y) < 58 * 58) {
        if (this.time - (car.lastRam || -9) > 0.6) {
          car.lastRam = this.time;
          player.car.speed *= 0.86;
          car.speed *= 0.8;
          if (events) events.copRam = true;
          this.burst(player.car.x, player.car.y, '#ffb703', 4, 90);
        }
      }
    } else if (dist2(car.x, car.y, player.x, player.y) < 34 * 34) {
      if (events) events.copTouch = true;
    }
  }

  updatePeds(dt, player, events) {
    for (let i = this.peds.length - 1; i >= 0; i -= 1) {
      const ped = this.peds[i];
      if (ped.hp <= 0) {
        this.burst(ped.x, ped.y, '#c0392b', 10, 100);
        this.peds.splice(i, 1);
        continue;
      }
      if (ped.kind === KIND_COP) {
        this.updateCopPed(dt, ped, player, events);
        continue;
      }
      if (ped.kind === KIND_RIVAL) {
        this.updateRival(dt, ped, player, events);
        continue;
      }
      if (ped.panic > 0) {
        ped.panic -= dt;
        const away = angleTo(player.x, player.y, ped.x, ped.y);
        ped.angle = away;
        ped.x += Math.cos(away) * 190 * dt;
        ped.y += Math.sin(away) * 190 * dt;
      } else {
        // Stroll along the sidewalk; turn at intersections.
        const step = ped.speed * dt * ped.dir;
        if (ped.horizontal) ped.x += step;
        else ped.y += step;
        const linePos = ped.horizontal ? ped.x : ped.y;
        if (ROAD_LINES.some((l) => Math.abs(linePos - l) < 6) && Math.random() < dt * 0.1) {
          ped.dir = Math.random() < 0.5 ? 1 : -1;
          ped.angle = ped.horizontal
            ? (ped.dir > 0 ? 0 : Math.PI)
            : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
        if (ped.x < 80 || ped.x > WORLD.size - 80 || ped.y < 80 || ped.y > WORLD.beachTop - 30) {
          ped.dir *= -1;
          ped.angle += Math.PI;
        }
        ped.angle = ped.horizontal
          ? (ped.dir > 0 ? 0 : Math.PI)
          : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      const fixed = this.collideCircle(ped.x, ped.y, 10);
      ped.x = fixed.x;
      ped.y = fixed.y;
    }
  }

  updateCopPed(dt, cop, player, events) {
    const d = Math.hypot(player.x - cop.x, player.y - cop.y);
    if (player.car || d > 700) {
      // Too far or the player is driving: the cop gives up and walks off.
      cop.state = 'walk';
      cop.x += Math.cos(cop.angle) * 60 * dt;
      cop.y += Math.sin(cop.angle) * 60 * dt;
      return;
    }
    cop.state = 'chase';
    const target = angleTo(cop.x, cop.y, player.x, player.y);
    cop.angle += clamp(angleDelta(cop.angle, target), -5 * dt, 5 * dt);
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    const fixed = this.collideCircle(cop.x, cop.y, 10);
    cop.x = fixed.x;
    cop.y = fixed.y;
    if (d < 30 && events) events.copTouch = true;
  }

  updateRival(dt, rival, player, events) {
    const d = Math.hypot(player.x - rival.x, player.y - rival.y);
    rival.shootCooldown -= dt;
    if (d < 520 && !player.car) {
      const target = angleTo(rival.x, rival.y, player.x, player.y);
      rival.angle = target;
      if (rival.shootCooldown <= 0 && d < 420) {
        rival.shootCooldown = 1.1 + Math.random() * 0.7;
        if (events) {
          events.rivalShots.push({ x: rival.x, y: rival.y, angle: target + (Math.random() - 0.5) * 0.22 });
        }
      }
      // Keep a little distance, but hold the line and shoot.
      if (d < 120) {
        rival.x -= Math.cos(target) * 40 * dt;
        rival.y -= Math.sin(target) * 40 * dt;
      }
    } else if (d < 700) {
      const target = angleTo(rival.x, rival.y, player.x, player.y);
      rival.angle = target;
      rival.x += Math.cos(target) * rival.speed * dt;
      rival.y += Math.sin(target) * rival.speed * dt;
    }
    const fixed = this.collideCircle(rival.x, rival.y, 10);
    rival.x = fixed.x;
    rival.y = fixed.y;
  }

  scarePeds(x, y, radius) {
    for (const ped of this.peds) {
      if (ped.kind !== KIND_PED) continue;
      if (dist2(ped.x, ped.y, x, y) < radius * radius) ped.panic = 2.5 + Math.random();
    }
  }
}
