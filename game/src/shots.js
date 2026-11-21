// Screenshot scenes behind ?shot=cover|street|drive|heist&seed=N.
// Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a scripted driver, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { PLACES, WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { nearestRoadLine } from './world.js';

const STEP = 1 / 60;

function driveAlongRoad(state, seconds, targetX, targetY) {
  // Scripted driver: follow the road grid to the target intersection,
  // one leg at a time. Sharp turns are taken the way a real driver would:
  // brake first, then swing the nose around in reverse if needed, so the
  // car never arcs off the road and into a building.
  const { player } = state;
  if (!player.car) return;
  const car = player.car;
  const tx = nearestRoadLine(targetX);
  const ty = nearestRoadLine(targetY);
  const startRoadY = nearestRoadLine(car.y);
  const startRoadX = nearestRoadLine(car.x);
  let waypoints;
  if (Math.abs(car.y - startRoadY) <= Math.abs(car.x - startRoadX)) {
    waypoints = [{ x: tx, y: startRoadY }, { x: tx, y: ty }];
  } else {
    waypoints = [{ x: startRoadX, y: ty }, { x: tx, y: ty }];
  }
  let leg = 0;
  state.shotTrace = state.shotTrace || [];
  let tick = 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    if (!player.car || leg >= waypoints.length) break;
    const wp = waypoints[leg];
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 70) {
      leg += 1;
      continue;
    }
    const angle = Math.atan2(wp.y - car.y, wp.x - car.x);
    let d = angle - car.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // Dead astern the shortest turn flips between +PI and -PI every step
    // and the car steers left, right, left, going nowhere: pick one side
    // (turn left) and stick to it until the nose is roughly on target.
    if (Math.abs(d) > Math.PI - 0.25) d = -Math.abs(d);
    const input = state.fakeInput;
    input.keys.clear();
    const ad = Math.abs(d);
    const speed = car.speed; // signed: forward positive, reverse negative
    const distWp = Math.hypot(wp.x - car.x, wp.y - car.y);
    const steerForward = () => { if (d > 0.1) input.keys.add('KeyD'); else if (d < -0.1) input.keys.add('KeyA'); };
    const steerReverse = () => { if (d > 0.1) input.keys.add('KeyA'); else if (d < -0.1) input.keys.add('KeyD'); };
    // Slow for the corner: arrive at a waypoint at a speed the turn allows.
    const cornerSpeed = Math.max(80, Math.min(560, distWp * 1.5));
    if (speed > cornerSpeed && ad < 2.4) {
      input.keys.add('KeyS');
      steerForward();
    } else if (ad > 1.2) {
      // A big turn: brake first, then swing the nose around in reverse.
      if (speed > 30) {
        input.keys.add('KeyS');
        steerForward();
      } else if (speed < -30) {
        input.keys.add('KeyW'); // slow the reverse down
        steerReverse();
      } else {
        input.keys.add('KeyS');
        steerReverse();
      }
    } else if (ad > 0.6 && speed > 50) {
      input.keys.add('KeyS');
      steerForward();
    } else {
      input.keys.add('KeyW');
      steerForward();
    }
    state.step(STEP);
    tick += 1;
    if (tick % 30 === 0) {
      state.shotTrace.push({ x: Math.round(car.x), y: Math.round(car.y), a: +car.angle.toFixed(2), s: Math.round(car.speed), leg, d: +d.toFixed(2), keys: [...input.keys].join('+'), wp: { x: wp.x, y: wp.y } });
    }
  }
}

function walkTo(state, seconds, targetX, targetY) {
  const { player } = state;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const angle = Math.atan2(targetY - player.y, targetX - player.x);
    const input = state.fakeInput;
    input.keys.clear();
    if (Math.abs(Math.cos(angle)) > 0.5) input.keys.add(Math.cos(angle) > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(Math.sin(angle)) > 0.5) input.keys.add(Math.sin(angle) > 0 ? 'KeyS' : 'KeyW');
    state.step(STEP);
    if (Math.hypot(targetX - player.x, targetY - player.y) < 40) break;
  }
}

function tidy(player) {
  // Staging bumps and scrapes are not part of the shot: full health, and
  // a moment of grace so nothing hurts the player in the frozen frame.
  player.health = 100;
  player.invulnerable = 5;
}

function putPlayerInCar(state, x, y) {
  // Park a fresh car on the nearest road edge by the requested point, so a
  // shot always starts where it is meant to (never a random parked car
  // half a city away).
  const { player, world } = state;
  const line = nearestRoadLine(y);
  const car = {
    kind: 'car',
    x, y: line + WORLD.roadWidth / 2 - 16,
    angle: 0,
    speed: 0,
    cruise: 100,
    color: '#e67e22',
    horizontal: true,
    line,
    dir: 1,
    parked: true,
    driver: false,
    id: world.cars.length,
    brakeLight: false,
  };
  world.cars.push(car);
  player.x = car.x;
  player.y = car.y;
  player.enterCar(car, {});
  return car;
}

/**
 * Set the game to the named scene and return the screen to draw over it.
 * cover: a 3-star police chase downtown, mission objective live.
 * street: on foot in Marlowe Plaza among traffic and pedestrians.
 * drive: speeding along the coast road at sunset, minimap and speedo live.
 * heist: the dock shootout, rivals and cops closing in.
 */
export function stageShot(name, state) {
  const { player, world, missions } = state;
  state.screen = SCREEN_PLAY;
  if (name === 'street') {
    player.x = PLACES.plaza.x - 60;
    player.y = PLACES.plaza.y + 90;
    player.angle = -Math.PI / 2;
    player.weapon = 'pistol';
    for (let i = 0; i < 8 / STEP; i += 1) state.step(STEP);
    walkTo(state, 6, PLACES.plaza.x + 40, PLACES.plaza.y - 40);
    tidy(player);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'drive') {
    // Start facing east and run the coast road east at full speed — no
    // U-turn, so the frame catches the car flat out.
    putPlayerInCar(state, 900, 3150);
    driveAlongRoad(state, 4, 3150, 3150);
    tidy(player);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'heist') {
    missions.index = 4;
    missions.active = true;
    missions.stage = 1;
    missions.rivalsKilled = 0;
    for (let i = 0; i < 3; i += 1) {
      world.spawnRival(PLACES.docks.x + (i - 1) * 90, 3150);
    }
    player.x = 2900;
    player.y = 3089; // on the sidewalk by the docks road, out of traffic
    player.weapon = 'pistol';
    player.addHeat(55, world.time);
    state.spawnPolice();
    for (let i = 0; i < 5 / STEP; i += 1) state.step(STEP);
    missions.updateObjective();
    tidy(player);
    return { screen: SCREEN_PLAY };
  }
  // cover (default): downtown chase, 3 stars, mission live.
  putPlayerInCar(state, 2025, 2025);
  missions.index = 2;
  missions.active = true;
  missions.stage = 0;
  player.addHeat(45, world.time);
  state.spawnPolice();
  driveAlongRoad(state, 10, 900, 450);
  missions.updateObjective();
  tidy(player);
  return { screen: SCREEN_PLAY };
}

export function shotTitle() {
  return SCREEN_TITLE;
}
