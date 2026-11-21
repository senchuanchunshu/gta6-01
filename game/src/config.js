// Cinder Bay — tuning constants and the city's fixed layout.
// Everything here is original: a sun-soaked coastal city of our own invention.
export const WORLD = {
  size: 3600,
  roadGap: 450,
  roadWidth: 96,
  sidewalk: 26,
  blockInset: 78,
  beachTop: 3330, // south of this line: sand, then water
  waterTop: 3490,
};

export const PLAYER = {
  walkSpeed: 210,
  sprintSpeed: 330,
  radius: 14,
  maxHealth: 100,
  punchDamage: 22,
  punchRange: 46,
  pistolDamage: 34,
  pistolRange: 430,
  pistolMag: 12,
  reloadSeconds: 1.1,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 170,
  turnRate: 2.6,
  grip: 3.2,
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 44;

export const WANTED = {
  // heat 0..100; stars = ceil(heat / 20), capped at 5
  stealCar: 22,
  hitPed: 18,
  killPed: 30,
  shoot: 8,
  killCop: 34,
  decayPerSecond: 1.6, // only while no police can see the player
  decayDelay: 6, // seconds after the last crime before decay starts
};

export const COLORS = {
  ground: '#c9b18a',
  grass: '#7fae5a',
  road: '#3d3a44',
  roadEdge: '#2c2933',
  sidewalk: '#b8ab90',
  sand: '#e8d5a4',
  water: '#2f7f9e',
  waterDeep: '#1f5f7d',
};

// Palette: warm sunset coast — terracotta, cream, teal, coral, sand.
export const BUILDING_COLORS = [
  '#e8b04b', '#d96f4e', '#4fa8a0', '#e9dcc3', '#c96f5a',
  '#7fb069', '#e07856', '#f2c14e', '#5b8e7d', '#d9a05b',
];
export const ROOF_COLORS = ['#b4552d', '#8a5a3b', '#3d6b66', '#a83232', '#5d4037'];
export const CAR_COLORS = [
  '#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50',
  '#8e44ad', '#16a085', '#e67e22', '#95a5a6', '#d35400',
];
export const PED_SHIRTS = [
  '#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6',
  '#1abc9c', '#e67e22', '#ecf0f1', '#34495e', '#fd79a8',
];

// Named places on the map (all invented). Each sits on a road or sidewalk
// so the player can actually reach it — never inside a building block.
export const PLACES = {
  safehouse: { x: 675, y: 900, label: 'Safehouse' },
  garage: { x: 1575, y: 900, label: "Rocco's Garage" },
  hospital: { x: 450, y: 1575, label: 'Bay General' },
  docks: { x: 3150, y: 3100, label: 'Cinder Docks' },
  pier: { x: 1800, y: 3400, label: 'Sunset Pier' },
  plaza: { x: 2025, y: 2025, label: 'Marlowe Plaza' },
  motel: { x: 2475, y: 900, label: 'Palm Court Motel' },
  warehouse: { x: 2925, y: 1800, label: 'Harbor Warehouse' },
};

export const MISSION_REWARDS = [400, 650, 900, 1400, 2500];
