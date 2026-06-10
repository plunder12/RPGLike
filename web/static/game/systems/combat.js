// 前端实时伤害公式（Phase 2，方案 A）。
// 量级对齐后端 systems/battle.py 的普攻计算，但在客户端实时执行。

function randRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// 玩家对怪物的一次普攻伤害。
// stats: { attack, crit_rate, crit_damage }
export function playerHitDamage(stats, monsterDefense) {
  let dmg = stats.attack;
  let crit = false;
  if (Math.random() < (stats.crit_rate || 0)) {
    dmg *= 1 + (stats.crit_damage || 0);
    crit = true;
  }
  dmg *= randRange(0.92, 1.08);
  const actual = Math.max(1, Math.floor(dmg - (monsterDefense || 0)));
  return { damage: actual, crit };
}

// 玩家技能伤害（含技能伤害加成、暴击、战吼buff）。
// skill: { damage_multiplier, control_reduction, ... }
// buffDamage: 当前战吼加成倍率（0 表示无 buff）
export function skillHitDamage(stats, skill, buffDamage = 0) {
  let dmg = stats.attack * (skill.damage_multiplier || 1.0);
  dmg *= 1 + (stats.skill_damage || 0);
  dmg *= 1 + buffDamage;
  let crit = false;
  if (Math.random() < (stats.crit_rate || 0)) {
    dmg *= 1 + (stats.crit_damage || 0);
    crit = true;
  }
  dmg *= randRange(0.92, 1.08);
  return { damage: Math.max(1, Math.floor(dmg)), crit };
}

// 怪物对玩家的一次攻击伤害。
export function monsterHitDamage(monsterAttack, playerDefense) {
  const raw = Math.floor(monsterAttack * randRange(0.88, 1.12));
  return Math.max(1, raw - (playerDefense || 0));
}
