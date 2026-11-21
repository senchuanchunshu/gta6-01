// The player: on foot and behind the wheel. Stealing cars, driving them,
// fighting, and the wanted level that follows the crimes.
import { WORLD, PLAYER, CAR, WANTED } from './config.js';
import { clamp, dist2, angleDelta } from './random.js';
import { KIND_CAR, KIND_COP_CAR } from './world.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 675;
    this.y = 839; // on the sidewalk by the safehouse road, never in a building
    this.angle = -Math.PI / 2;
    this.health = PLAYER.maxHealth;
    this.cash = 250;
    this.car = null; // the car currently driven, or null on foot
    this.speed = 0;
    this.weapon = 'fists'; // 'fists' | 'pistol'
    this.ammo = PLAYER.pistolMag;
    this.reserveAmmo = 48;
    this.reloading = 0;
    this.shootCooldown = 0;
    this.punchCooldown = 0;
    this.heat = 0; // 0..100, stars = ceil(heat / 20)
    this.lastCrime = -99;
    this.bustedTimer = 0;
    this.invulnerable = 0;
    this.missionIndex = 0;
    this.missionsDone = 0;
    this.kills = 0;
    this.carsStolen = 0;
    this.dead = false;
  }

  get wanted() {
    return Math.min(5, Math.ceil(this.heat / 20));
  }

  get driving() {
    return this.car !== null;
  }

  addHeat(amount, now) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrime = now;
  }

  update(dt, input, events, audio) {
    if (this.dead) return;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0 && this.reserveAmmo > 0) {
        const need = PLAYER.pistolMag - this.ammo;
        const take = Math.min(need, this.reserveAmmo);
        this.ammo += take;
        this.reserveAmmo -= take;
      }
    }
    // Wanted decays once the player has stayed clean and unseen for a while.
    if (this.heat > 0 && this.world.time - this.lastCrime > WANTED.decayDelay) {
      const nearestCop = this.nearestCopDistance();
      if (nearestCop > 620) this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * dt);
    }
    if (this.car) this.updateDriving(dt, input, events, audio);
    else this.updateOnFoot(dt, input, events);
    if (input.pressed('KeyQ')) {
      this.weapon = this.weapon === 'fists' ? 'pistol' : 'fists';
    }
    if (input.pressed('KeyR') && this.weapon === 'pistol' && this.ammo < PLAYER.pistolMag && this.reserveAmmo > 0 && this.reloading <= 0) {
      this.reloading = PLAYER.reloadSeconds;
    }
  }

  nearestCopDistance() {
    let best = Infinity;
    for (const car of this.world.cars) {
      if (car.kind !== KIND_COP_CAR) continue;
      best = Math.min(best, Math.hypot(car.x - this.x, car.y - this.y));
    }
    for (const ped of this.world.peds) {
      if (ped.kind !== 'cop') continue;
      best = Math.min(best, Math.hypot(ped.x - this.x, ped.y - this.y));
    }
    return best;
  }

  updateOnFoot(dt, input, events) {
    const move = input.moveVector();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const nx = this.x + move.x * speed * dt;
    const ny = this.y + move.y * speed * dt;
    const fixed = this.world.collideCircle(nx, ny, PLAYER.radius);
    // Do not walk through cars: push out of their rectangles.
    let px = fixed.x;
    let py = fixed.y;
    for (const car of this.world.cars) {
      const dx = px - car.x;
      const dy = py - car.y;
      const ca = Math.cos(-car.angle);
      const sa = Math.sin(-car.angle);
      const lx = dx * ca - dy * sa;
      const ly = dx * sa + dy * ca;
      if (Math.abs(lx) < 36 && Math.abs(ly) < 22) {
        const pushX = (36 - Math.abs(lx)) * Math.sign(lx || 1);
        const pushY = (22 - Math.abs(ly)) * Math.sign(ly || 1);
        if (Math.abs(pushX) < Math.abs(pushY)) px += pushX * Math.cos(car.angle);
        else py += pushY * Math.sin(car.angle);
        const f2 = this.world.collideCircle(px, py, PLAYER.radius);
        px = f2.x;
        py = f2.y;
      }
    }
    this.x = px;
    this.y = py;
    if (move.x !== 0 || move.y !== 0) this.angle = Math.atan2(move.y, move.x);
    this.speed = (move.x !== 0 || move.y !== 0) ? speed : 0;

    if (input.pressed('KeyE')) {
      const car = this.nearestCar(90);
      if (car) this.enterCar(car, events);
    }
    // Pickups.
    for (const pk of this.world.pickups) {
      if (pk.taken) continue;
      if (dist2(this.x, this.y, pk.x, pk.y) < 44 * 44) {
        pk.taken = true;
        if (pk.kind === 'health') {
          this.health = Math.min(PLAYER.maxHealth, this.health + 50);
          this.world.floater(this.x, this.y - 20, '+50 HEALTH', '#7CFC9A');
        } else if (pk.kind === 'cash') {
          this.cash += 150;
          this.world.floater(this.x, this.y - 20, '+$150', '#ffd166');
        } else {
          this.reserveAmmo += 36;
          this.world.floater(this.x, this.y - 20, '+36 AMMO', '#ffd166');
        }
        if (events) events.pickup = true;
      }
    }
    // Getting run over by traffic hurts (police cars arrest instead — they
    // close in for the bust rather than running the player down).
    for (const car of this.world.cars) {
      if (car.parked || car.kind === KIND_COP_CAR || Math.abs(car.speed) < 40) continue;
      if (dist2(this.x, this.y, car.x, car.y) < 30 * 30) {
        if (this.hurt(12, events)) {
          const away = Math.atan2(this.y - car.y, this.x - car.x);
          this.x += Math.cos(away) * 26;
          this.y += Math.sin(away) * 26;
        }
      }
    }
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of this.world.cars) {
      if (car.kind === KIND_COP_CAR) continue;
      const d = dist2(this.x, this.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car, events) {
    this.car = car;
    car.parked = false;
    car.speed = 0;
    this.x = car.x;
    this.y = car.y;
    this.angle = car.angle;
    if (car.driver) {
      // Stealing an occupied car: the driver flees, the law notices.
      car.driver = false;
      this.carsStolen += 1;
      this.addHeat(WANTED.stealCar, this.world.time);
      this.world.scarePeds(car.x, car.y, 220);
      if (events) events.stoleCar = true;
    }
  }

  exitCar(events) {
    if (!this.car) return;
    const car = this.car;
    const side = Math.cos(this.angle + Math.PI / 2);
    const sideY = Math.sin(this.angle + Math.PI / 2);
    this.x = car.x + side * 34;
    this.y = car.y + sideY * 34;
    const fixed = this.world.collideCircle(this.x, this.y, PLAYER.radius);
    this.x = fixed.x;
    this.y = fixed.y;
    car.speed = 0;
    car.parked = true;
    this.car = null;
    this.angle = car.angle;
  }

  updateDriving(dt, input, events, audio) {
    const car = this.car;
    const forward = input.down('KeyW') || input.down('ArrowUp');
    const back = input.down('KeyS') || input.down('ArrowDown');
    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');
    const handbrake = input.down('Space');
    if (forward) car.speed += CAR.accel * dt;
    if (back) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (!forward && !back) {
      const drag = 160 * dt;
      car.speed = Math.abs(car.speed) < drag ? 0 : car.speed - Math.sign(car.speed) * drag;
    }
    if (handbrake) car.speed *= Math.max(0, 1 - 3.2 * dt);
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const grip = handbrake ? 1.7 : 1;
    if (Math.abs(car.speed) > 12) {
      car.angle += steer * CAR.turnRate * grip * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 140);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const before = { x: car.x, y: car.y };
    car.x = nx;
    car.y = ny;
    const hitWall = this.world.collideCar(car);
    if (hitWall) {
      const impact = Math.abs(car.speed);
      car.speed *= -0.25;
      if (impact > 240 && events) events.crash = true;
      if (impact > 240) this.world.burst(car.x, car.y, '#ffb703', 6, 120);
    }
    // Running over pedestrians is a crime, and it is noticed.
    for (let i = this.world.peds.length - 1; i >= 0; i -= 1) {
      const ped = this.world.peds[i];
      if (ped.kind !== 'ped') continue;
      if (dist2(car.x, car.y, ped.x, ped.y) < 30 * 30 && Math.abs(car.speed) > 60) {
        ped.hp = 0;
        this.addHeat(WANTED.hitPed, this.world.time);
        this.world.scarePeds(car.x, car.y, 320);
        if (events) events.ranOverPed = true;
      }
    }
    // Bumping traffic cars shoves them aside; the speed loss applies once
    // per contact, not every step, or two touching cars would grind to a
    // halt together.
    for (const other of this.world.cars) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 56 * 56) {
        const d = Math.sqrt(d2) || 1;
        const overlap = 56 - d;
        const nx = dx / d;
        const ny = dy / d;
        other.x += nx * overlap * 0.7;
        other.y += ny * overlap * 0.7;
        car.x -= nx * overlap * 0.3;
        car.y -= ny * overlap * 0.3;
        if (this.world.time - (car.lastBump || -9) > 0.5) {
          car.lastBump = this.world.time;
          other.speed *= 0.7;
          car.speed *= 0.9;
        }
      }
    }
    this.x = car.x;
    this.y = car.y;
    this.angle = car.angle;
    this.speed = car.speed;
    if (input.pressed('KeyE')) this.exitCar(events);
    if (Math.abs(car.speed) > 300 && Math.random() < dt * 6) {
      this.world.particles.push({
        x: car.x - Math.cos(car.angle) * 30,
        y: car.y - Math.sin(car.angle) * 30,
        vx: -Math.cos(car.angle) * 40, vy: -Math.sin(car.angle) * 40,
        life: 0.4, maxLife: 0.4, color: '#d8cbb2', size: 3,
      });
    }
  }

  hurt(amount, events) {
    if (this.invulnerable > 0 || this.dead) return false;
    this.health -= amount;
    this.invulnerable = 0.35;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      if (events) events.wasted = true;
    }
    return true;
  }

  // A shot from the player toward world point (tx, ty). Returns true if fired.
  shoot(tx, ty, events) {
    if (this.weapon === 'fists') {
      if (this.punchCooldown > 0) return false;
      this.punchCooldown = 0.38;
      const reach = this.driving ? 0 : PLAYER.punchRange;
      if (reach === 0) return false;
      let hitAny = false;
      for (const ped of this.world.peds) {
        if (dist2(this.x, this.y, ped.x, ped.y) < reach * reach) {
          ped.hp -= PLAYER.punchDamage;
          if (ped.kind === 'ped') this.addHeat(WANTED.hitPed, this.world.time);
          if (ped.kind === 'cop') this.addHeat(WANTED.killCop, this.world.time);
          hitAny = true;
        }
      }
      if (hitAny && events) events.punch = true;
      return hitAny;
    }
    if (this.reloading > 0 || this.shootCooldown > 0) return false;
    if (this.ammo <= 0) {
      if (events) events.dryFire = true;
      return false;
    }
    this.ammo -= 1;
    this.shootCooldown = 0.22;
    const angle = Math.atan2(ty - this.y, tx - this.x);
    const ox = this.x + Math.cos(angle) * 22;
    const oy = this.y + Math.sin(angle) * 22;
    this.world.burst(ox, oy, '#ffe066', 5, 160);
    this.world.scarePeds(this.x, this.y, 420);
    this.addHeat(WANTED.shoot, this.world.time);
    // Hit the first ped or car along the shot, or stop at a building.
    let bestD = PLAYER.pistolRange;
    let target = null;
    for (const ped of this.world.peds) {
      const d = this.shotHitDistance(angle, ped.x, ped.y, 14);
      if (d !== null && d < bestD) {
        bestD = d;
        target = ped;
      }
    }
    for (const car of this.world.cars) {
      if (car === this.car) continue;
      const d = this.shotHitDistance(angle, car.x, car.y, 26);
      if (d !== null && d < bestD) {
        bestD = d;
        target = car;
      }
    }
    for (const b of this.world.buildings) {
      const d = this.shotHitBuilding(angle, b);
      if (d !== null && d < bestD) {
        bestD = d;
        target = null;
      }
    }
    const hx = this.x + Math.cos(angle) * bestD;
    const hy = this.y + Math.sin(angle) * bestD;
    this.world.particles.push({
      x: hx, y: hy, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, color: '#fff3b0', size: 5,
    });
    if (target) {
      if (target.hp !== undefined) {
        target.hp -= PLAYER.pistolDamage;
        if (target.hp <= 0) {
          this.kills += 1;
          if (target.kind === 'ped') this.addHeat(WANTED.killPed, this.world.time);
          if (target.kind === 'cop') this.addHeat(WANTED.killCop, this.world.time);
          if (target.kind === 'rival' && events) events.rivalKilled = true;
        }
      } else {
        target.speed *= 0.4;
        this.world.burst(hx, hy, '#ffb703', 6, 110);
      }
    }
    if (events) events.shot = true;
    return true;
  }

  shotHitDistance(angle, tx, ty, radius) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > PLAYER.pistolRange) return null;
    const lateral = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return lateral < radius ? along : null;
  }

  shotHitBuilding(angle, b) {
    // Ray vs axis-aligned rectangle, slab method.
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let tmin = 0;
    let tmax = PLAYER.pistolRange;
    if (Math.abs(dx) < 1e-9) {
      if (this.x < b.x || this.x > b.x + b.w) return null;
    } else {
      let t1 = (b.x - this.x) / dx;
      let t2 = (b.x + b.w - this.x) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (Math.abs(dy) < 1e-9) {
      if (this.y < b.y || this.y > b.y + b.h) return null;
    } else {
      let t1 = (b.y - this.y) / dy;
      let t2 = (b.y + b.h - this.y) / dy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  }
}
