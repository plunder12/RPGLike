"""技能描述与数值格式化。"""

from config.skills import SkillTemplate, resolve_active_skill, resolve_passive_bonus

PASSIVE_STAT_NAMES = {
    "hp_regen": "每回合回血",
    "resource_regen": "每回合回能",
    "defense": "防御",
    "skill_damage": "技能伤害",
    "crit_rate": "暴击率",
    "crit_damage": "暴击伤害",
    "attack": "攻击",
    "max_hp": "生命",
}


def _fmt_percent(v: float) -> str:
    return f"{v * 100:.0f}%"


def _fmt_mult(v: float) -> str:
    return f"{v:.2f}x"


def format_skill_rank_values(template: SkillTemplate) -> str:
    """生成各等级具体数值，如 1.50x/1.75x/2.00x。"""
    if template.skill_type == "passive":
        parts = []
        for stat, per_rank in template.passive_per_rank.items():
            name = PASSIVE_STAT_NAMES.get(stat, stat)
            vals = []
            for r in range(1, template.max_rank + 1):
                v = resolve_passive_bonus(template, r)[stat]
                if stat in ("skill_damage", "crit_rate", "crit_damage"):
                    vals.append(_fmt_percent(v))
                else:
                    vals.append(str(int(v)))
            parts.append(f"{name}: {'/'.join(vals)}")
        return " | ".join(parts)

    lines = []
    dmg_vals = []
    heal_vals = []
    buff_vals = []
    cd_vals = []
    cost_vals = []
    ctrl_vals = []

    for r in range(1, template.max_rank + 1):
        eff = resolve_active_skill(template, r)
        if eff.get("damage_multiplier", 0) > 0:
            dmg_vals.append(_fmt_mult(eff["damage_multiplier"]))
        if eff.get("heal_ratio", 0) > 0:
            heal_vals.append(_fmt_percent(eff["heal_ratio"]))
        if eff.get("buff_damage", 0) > 0:
            buff_vals.append(f"+{_fmt_percent(eff['buff_damage'])}")
        cd_vals.append(str(eff.get("cooldown", template.cooldown)))
        cost_vals.append(str(eff.get("resource_cost", template.resource_cost)))
        if eff.get("control_reduction", 0) > 0:
            ctrl_vals.append(_fmt_percent(eff["control_reduction"]))

    if dmg_vals:
        lines.append(f"伤害倍率: {'/'.join(dmg_vals)}")
    if heal_vals:
        lines.append(f"治疗比例: {'/'.join(heal_vals)}")
    if buff_vals:
        lines.append(f"增伤: {'/'.join(buff_vals)}")
    if any(float(c) > 0 for c in cd_vals):
        lines.append(f"冷却: {'/'.join(cd_vals)}回合")
    if cost_vals:
        lines.append(f"消耗: {'/'.join(cost_vals)}")
    if ctrl_vals:
        lines.append(f"敌人减伤: {'/'.join(ctrl_vals)}")
    return " | ".join(lines) if lines else template.desc
