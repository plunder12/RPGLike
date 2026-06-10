"""装备属性对比。"""

from config.constants import PERCENT_AFFIX_KEYS, SLOT_NAMES
from config.forge import FORGE_PERCENT_PER_LEVEL
from models.equipment import Equipment

STAT_LABELS = [
    ("attack", "攻击", False),
    ("defense", "防御", False),
    ("max_hp", "生命", False),
    ("crit_rate", "暴击率", True),
    ("crit_damage", "暴击伤", True),
    ("skill_damage", "技能伤", True),
    ("hp_regen", "每回合回血", False),
    ("resource_regen", "每回合回能", False),
]


def _bonus(item: Equipment | None, forge_level: int) -> dict:
    if not item:
        return {k: 0 if not is_pct else 0.0 for k, _, is_pct in STAT_LABELS}
    return item.stat_bonus(forge_level=forge_level, forge_percent=FORGE_PERCENT_PER_LEVEL)


def _fmt_val(key: str, v: float, is_pct: bool) -> str:
    if is_pct or key in PERCENT_AFFIX_KEYS:
        return f"{v * 100:.1f}%"
    return str(int(v))


def _fmt_delta(key: str, d: float, is_pct: bool) -> str:
    if abs(d) < (0.001 if is_pct else 0.5):
        return "±0"
    sign = "+" if d > 0 else ""
    if is_pct or key in PERCENT_AFFIX_KEYS:
        return f"{sign}{d * 100:.1f}%"
    return f"{sign}{int(d)}"


def compare_equipment(
    new_item: Equipment,
    old_item: Equipment | None,
    forge_level: int = 0,
) -> list[str]:
    """返回新装备相对旧装备的对比行。"""
    new_b = _bonus(new_item, forge_level)
    old_b = _bonus(old_item, forge_level)
    lines = []
    for key, label, is_pct in STAT_LABELS:
        nv = new_b.get(key, 0)
        ov = old_b.get(key, 0)
        if nv == 0 and ov == 0:
            continue
        delta = nv - ov
        lines.append(
            f"  {label}: {_fmt_val(key, nv, is_pct)} "
            f"(当前 {_fmt_val(key, ov, is_pct)}, {_fmt_delta(key, delta, is_pct)})"
        )
    return lines


def equipment_power_score(bonus: dict) -> float:
    """简易战力评分，用于一眼看出升降。"""
    return (
        bonus.get("attack", 0) * 2
        + bonus.get("defense", 0) * 1.5
        + bonus.get("max_hp", 0) * 0.2
        + bonus.get("crit_rate", 0) * 500
        + bonus.get("crit_damage", 0) * 300
        + bonus.get("skill_damage", 0) * 400
        + bonus.get("hp_regen", 0) * 3
        + bonus.get("resource_regen", 0) * 3
    )


def compare_tag(new_item: Equipment, old_item: Equipment | None, forge_level: int) -> str:
    if not old_item:
        return "[新部位]"
    ns = equipment_power_score(_bonus(new_item, forge_level))
    os = equipment_power_score(_bonus(old_item, forge_level))
    if ns > os * 1.02:
        return "[↑提升]"
    if ns < os * 0.98:
        return "[↓降低]"
    return "[≈相近]"
