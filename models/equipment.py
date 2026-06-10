"""装备与词缀系统。"""

import random
from dataclasses import dataclass, field

from config.constants import (
    AFFIX_DEFINITIONS,
    EQUIPMENT_SLOTS,
    PERCENT_AFFIX_KEYS,
    RARITIES,
    SLOT_AFFIX_ALLOWED,
    SLOT_NAMES,
    get_available_rarities,
)


WEAPON_NAMES = ["长剑", "战斧", "法杖", "拳套", "匕首", "巨锤"]
ARMOR_PREFIX = ["铁", "钢", "秘银", "奥术", "不朽", "远古"]


@dataclass
class Affix:
    stat_key: str
    display_name: str
    value: float

    def format_value(self) -> str:
        if self.stat_key in PERCENT_AFFIX_KEYS:
            return f"+{self.value * 100:.1f}%"
        return f"+{int(self.value)}"


@dataclass
class Equipment:
    slot: str
    name: str
    rarity: str
    floor: int
    affixes: list[Affix] = field(default_factory=list)

    def raw_stat_bonus(self) -> dict:
        bonus = {
            "max_hp": 0, "attack": 0, "defense": 0,
            "crit_rate": 0.0, "crit_damage": 0.0, "skill_damage": 0.0,
            "hp_regen": 0, "resource_regen": 0,
        }
        for affix in self.affixes:
            if affix.stat_key in bonus:
                bonus[affix.stat_key] += affix.value
        return bonus

    def stat_bonus(self, forge_level: int = 0, forge_percent: float = 0.10) -> dict:
        """含锻造百分比加成的部位属性。"""
        raw = self.raw_stat_bonus()
        if forge_level <= 0:
            return raw
        mult = 1 + forge_level * forge_percent
        result = dict(raw)
        for key in PERCENT_AFFIX_KEYS:
            if key in result:
                result[key] = result[key] * mult
        for key in ("attack", "defense", "max_hp", "hp_regen", "resource_regen"):
            if key in result:
                result[key] = int(result[key] * mult) if key != "max_hp" else int(result[key] * mult)
        return result

    def summary(self) -> str:
        affix_str = " | ".join(f"{a.display_name}{a.format_value()}" for a in self.affixes)
        slot_cn = SLOT_NAMES.get(self.slot, self.slot)
        color = RARITIES[self.rarity]["color"]
        return f"[{color}·{self.rarity}]{self.name}({slot_cn}) {affix_str}"

    def to_dict(self) -> dict:
        return {
            "slot": self.slot,
            "name": self.name,
            "rarity": self.rarity,
            "floor": self.floor,
            "affixes": [
                {"stat_key": a.stat_key, "display_name": a.display_name, "value": a.value}
                for a in self.affixes
            ],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Equipment":
        affixes = [Affix(**a) for a in data["affixes"]]
        return cls(
            slot=data["slot"],
            name=data["name"],
            rarity=data["rarity"],
            floor=data["floor"],
            affixes=affixes,
        )


def _roll_rarity(floor: int) -> str:
    pool = get_available_rarities(floor)
    weights = [RARITIES[r]["drop_weight"] for r in pool]
    total = sum(weights)
    r = random.randint(1, total)
    cumulative = 0
    for name, weight in zip(pool, weights):
        cumulative += weight
        if r <= cumulative:
            return name
    return pool[0]


def _generate_name(slot: str, rarity: str) -> str:
    prefix = random.choice(ARMOR_PREFIX)
    if slot == "weapon":
        return random.choice(WEAPON_NAMES)
    slot_cn = SLOT_NAMES.get(slot, slot)
    if rarity == "传奇":
        return f"{prefix}·{slot_cn}·{random.choice(['毁灭', '庇护', '狂怒', '贤者'])}"
    return f"{prefix}{slot_cn}"


def _calc_affix_value(stat_key: str, floor: int, rarity: str) -> float:
    _, is_percent, (lo, hi) = AFFIX_DEFINITIONS[stat_key]
    mult = RARITIES[rarity]["value_mult"]
    floor_scale = 1 + floor * 0.12

    if is_percent:
        raw = random.uniform(lo, hi) * mult * floor_scale
        return max(0.01, round(raw, 3))

    raw = random.uniform(lo, hi) * mult * floor_scale
    return max(1, int(round(raw)))


def _roll_affixes(slot: str, floor: int, rarity: str) -> list[Affix]:
    allowed = list(SLOT_AFFIX_ALLOWED.get(slot, ()))
    lo_count, hi_count = RARITIES[rarity]["affix_count"]
    count = random.randint(lo_count, hi_count)
    count = min(count, len(allowed))

    random.shuffle(allowed)
    affixes: list[Affix] = []
    used: set[str] = set()
    for stat_key in allowed[:count]:
        if stat_key in used:
            continue
        used.add(stat_key)
        display_name = AFFIX_DEFINITIONS[stat_key][0]
        value = _calc_affix_value(stat_key, floor, rarity)
        affixes.append(Affix(stat_key, display_name, value))

    if not affixes:
        stat_key = random.choice(allowed)
        display_name = AFFIX_DEFINITIONS[stat_key][0]
        value = _calc_affix_value(stat_key, floor, rarity)
        affixes.append(Affix(stat_key, display_name, value))

    return affixes


def generate_equipment(floor: int, slot: str | None = None) -> Equipment:
    slot = slot or random.choice(EQUIPMENT_SLOTS)
    rarity = _roll_rarity(floor)
    return Equipment(
        slot=slot,
        name=_generate_name(slot, rarity),
        rarity=rarity,
        floor=floor,
        affixes=_roll_affixes(slot, floor, rarity),
    )
