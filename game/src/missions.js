// The story: Danny "Dash" Cole, a bike courier in Cinder Bay, gets pulled
// into Rocco Marlowe's crew. Five missions, each with staged objectives,
// a map marker, dialogue lines and a cash reward. All characters original.
import { PLACES, MISSION_REWARDS } from './config.js';
import { dist2 } from './random.js';
import { KIND_RIVAL } from './world.js';

export const MISSIONS = [
  {
    id: 'delivery',
    title: 'First Delivery',
    brief: 'Rocco needs a package at the Palm Court Motel. Grab a car and take it there. No questions.',
    stages: [
      { type: 'goto', x: PLACES.motel.x, y: PLACES.motel.y, label: 'Drive to the Palm Court Motel', radius: 70 },
    ],
    intro: ['Rocco: "You ride fast, kid. One package, one motel. Don\'t open it."'],
  },
  {
    id: 'borrowed',
    title: 'Borrowed Wheels',
    brief: 'The crew needs a clean ride. Steal the teal sedan parked by the garage and bring it back.',
    stages: [
      { type: 'steal', label: 'Steal the teal sedan near the garage', radius: 60 },
      { type: 'goto', x: PLACES.garage.x, y: PLACES.garage.y, label: 'Deliver the sedan to the garage', radius: 80, needCar: true },
    ],
    intro: ['Rocco: "Borrow it. If the owner objects, he\'s wrong."'],
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    brief: 'The cops are onto the drop. Lose them — get your wanted level to zero, then reach the safehouse.',
    stages: [
      { type: 'heat', label: 'Lose the cops: get your wanted level to zero' },
      { type: 'goto', x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: 'Reach the safehouse', radius: 70 },
    ],
    intro: ['Mara: "Sirens already. Drive like the rent is due, Dash."'],
    onStart: 'heat',
  },
  {
    id: 'drop',
    title: 'The Drop',
    brief: 'Rival crew "The Vultures" took our briefcase to the warehouse. Take it back — on foot, loud if you must.',
    stages: [
      { type: 'goto', x: PLACES.warehouse.x, y: PLACES.warehouse.y, label: 'Reach the Harbor Warehouse', radius: 80 },
      { type: 'kill', count: 4, label: 'Deal with the Vultures guarding the case (0/4)', radius: 400 },
      { type: 'goto', x: PLACES.plaza.x, y: PLACES.plaza.y, label: 'Bring the briefcase to Marlowe Plaza', radius: 70 },
    ],
    intro: ['Rocco: "Four of them, one case. The case comes home. You come home."'],
    onStart: 'rivals',
  },
  {
    id: 'heist',
    title: 'Harbor Heist',
    brief: 'The big one: grab the shipment at the docks, then outrun a four-star response to the safehouse.',
    stages: [
      { type: 'goto', x: PLACES.docks.x, y: PLACES.docks.y, label: 'Reach the Cinder Docks', radius: 80 },
      { type: 'kill', count: 3, label: 'Clear the dock guards (0/3)', radius: 420 },
      { type: 'escape', label: 'Escape to the safehouse — the whole city is coming', radius: 70 },
    ],
    intro: ['Mara: "Last job. After this, you\'re crew. Don\'t get cute at the docks."'],
    onStart: 'rivals',
  },
];

export class MissionManager {
  constructor(world, player) {
    this.world = world;
    this.player = player;
    this.index = 0; // mission in progress (0..4), 5 = story complete
    this.stage = 0;
    this.active = false;
    this.targetCar = null;
    this.rivalsSpawned = 0;
    this.rivalsKilled = 0;
    this.message = '';
    this.messageTimer = 0;
    this.objective = 'Find the yellow marker to start the next job.';
    this.marker = { x: PLACES.garage.x, y: PLACES.garage.y };
    this.completedAll = false;
  }

  get current() {
    return this.index < MISSIONS.length ? MISSIONS[this.index] : null;
  }

  get stageDef() {
    const m = this.current;
    return m ? m.stages[this.stage] : null;
  }

  say(text, seconds) {
    this.message = text;
    this.messageTimer = seconds || 4;
  }

  startMission() {
    const mission = this.current;
    if (!mission || this.active) return;
    this.active = true;
    this.stage = 0;
    this.rivalsKilled = 0;
    this.rivalsSpawned = 0;
    this.say(mission.title + ' — ' + mission.brief, 5);
    if (mission.onStart === 'heat') {
      this.player.addHeat(45, this.world.time);
    }
    if (mission.onStart === 'rivals') {
      const spot = mission.id === 'heist' ? PLACES.docks : PLACES.warehouse;
      const count = mission.id === 'heist' ? 3 : 4;
      // Line them up on the road by the spot, never inside a building.
      const roadY = Math.round(spot.y / 450) * 450;
      for (let i = 0; i < count; i += 1) {
        this.world.spawnRival(spot.x + (i - (count - 1) / 2) * 90, roadY);
        this.rivalsSpawned += 1;
      }
    }
    if (mission.id === 'borrowed') {
      // The teal sedan: find a parked car near the garage and paint it teal.
      let best = null;
      let bestD = Infinity;
      for (const car of this.world.cars) {
        if (!car.parked) continue;
        const d = dist2(car.x, car.y, PLACES.garage.x, PLACES.garage.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) {
        best.color = '#2ec4b6';
        this.targetCar = best;
      }
    }
    this.updateObjective();
  }

  updateObjective() {
    const m = this.current;
    if (!m) {
      this.objective = 'Story complete — Cinder Bay is yours. Free roam!';
      this.marker = null;
      return;
    }
    if (!this.active) {
      this.objective = 'Job available: ' + m.title + ' — reach the yellow marker.';
      this.marker = { x: PLACES.garage.x, y: PLACES.garage.y };
      return;
    }
    const s = this.stageDef;
    if (!s) return;
    if (s.type === 'kill') {
      this.objective = s.label.replace(/\(\d+\/\d+\)/, `(${this.rivalsKilled}/${s.count})`);
    } else {
      this.objective = s.label;
    }
    if (s.x !== undefined) this.marker = { x: s.x, y: s.y };
    else if (s.type === 'steal' && this.targetCar) this.marker = { x: this.targetCar.x, y: this.targetCar.y };
    else if (s.type === 'escape') this.marker = { x: PLACES.safehouse.x, y: PLACES.safehouse.y };
    else this.marker = null;
  }

  advanceStage() {
    this.stage += 1;
    const m = this.current;
    if (this.stage >= m.stages.length) {
      this.completeMission();
      return;
    }
    this.say('Objective updated: ' + m.stages[this.stage].label, 4);
    this.updateObjective();
  }

  completeMission() {
    const m = this.current;
    const reward = MISSION_REWARDS[this.index] || 500;
    this.player.cash += reward;
    this.player.missionsDone += 1;
    this.world.floater(this.player.x, this.player.y - 30, `+$${reward}  ${m.title} COMPLETE`, '#ffd166');
    this.say(`${m.title} complete! +$${reward}.`, 5);
    this.active = false;
    this.index += 1;
    this.stage = 0;
    if (this.index >= MISSIONS.length) {
      this.completedAll = true;
      this.say('Story complete! You run Cinder Bay now. Free roam — cause trouble, lose the cops, repeat.', 6);
    }
    this.updateObjective();
  }

  // Called when the player kills a rival (via player events).
  onRivalKilled() {
    if (!this.active) return;
    const s = this.stageDef;
    if (s && s.type === 'kill') {
      this.rivalsKilled += 1;
      this.updateObjective();
      if (this.rivalsKilled >= s.count) this.advanceStage();
    }
  }

  update(dt, events) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    const m = this.current;
    const p = this.player;
    if (!m) return;
    if (!this.active) {
      // Start the next job by reaching the yellow marker on foot or by car.
      if (dist2(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 80 * 80) {
        this.startMission();
        if (events) events.missionStart = true;
      }
      return;
    }
    const s = this.stageDef;
    if (!s) return;
    if (s.type === 'goto') {
      const ok = s.needCar ? p.driving : true;
      if (ok && dist2(p.x, p.y, s.x, s.y) < s.radius * s.radius) {
        if (events) events.objectiveDone = true;
        this.advanceStage();
      }
    } else if (s.type === 'steal') {
      if (this.targetCar && p.car === this.targetCar) {
        if (events) events.objectiveDone = true;
        this.advanceStage();
      }
    } else if (s.type === 'heat') {
      if (p.wanted === 0) this.advanceStage();
    } else if (s.type === 'escape') {
      if (p.wanted > 0) p.addHeat(0, this.world.time); // keep the heat on
      if (dist2(p.x, p.y, PLACES.safehouse.x, PLACES.safehouse.y) < s.radius * s.radius && p.wanted <= 2) {
        p.heat = 0;
        this.advanceStage();
      }
    }
    // Keep the finale hot: the docks stage spawns a 4-star response.
    if (m.id === 'heist' && this.stage === 2 && p.wanted < 4) {
      p.heat = Math.max(p.heat, 70);
    }
  }
}
