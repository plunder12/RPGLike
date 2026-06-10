// Phase 0 游戏常量与测试地图。
// 后续阶段地图将改为 Tiled JSON 加载，这里先用程序化数组跑通玩法。

export const TILE = 32;          // 单格像素
export const PLAYER_SPEED = 200; // 像素/秒

// ── 攻击范围（像素，世界坐标，zoom=1.5 时视觉距离 = 值×1.5）──
export const BASIC_ATTACK_RANGE = 72;  // 默认近战普攻（约 2.25 tile）

/** 各职业普攻范围：法师远程，武僧略远，野蛮人近战 */
export const CLASS_ATTACK_RANGE = {
  barbarian: 72,
  monk: 88,
  wizard: 240,
};

export function getAttackRange(classId) {
  return CLASS_ATTACK_RANGE[classId] ?? BASIC_ATTACK_RANGE;
}

// Phase 3 技能范围预留：各类型默认半径/长度，
// 后续在 config/skills.py 里为每个技能加 range_type + range_value 字段。
export const SKILL_RANGES = {
  melee:  90,   // 近战强化技能（刀气、重击）
  mid:   160,   // 中程爆发（冲刺、扇形）
  ranged: 320,  // 远程投射（法球、箭矢）
  aoe:   120,   // 以自身为中心的 AoE（旋风斩、震地）
  explosion: 96, // 投射命中后的爆炸半径（火球术等）
};

export const COLORS = {
  floor: 0x1e1b24,
  floorAlt: 0x24202b,
  wall: 0x4a3f55,
  wallTop: 0x6b5d78,
  player: 0xc9a227,
  bg: 0x0f0e12,
};

// 测试地图：0 = 地面，1 = 墙
// 一个带边界墙 + 内部障碍的房间，用于验证移动与碰撞。
export const TEST_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const MAP_COLS = TEST_MAP[0].length;
export const MAP_ROWS = TEST_MAP.length;
export const MAP_WIDTH = MAP_COLS * TILE;
export const MAP_HEIGHT = MAP_ROWS * TILE;
