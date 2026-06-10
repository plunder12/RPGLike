"""全局游戏常量。"""

EQUIPMENT_SLOTS = ("weapon", "helm", "chest", "gloves", "boots", "ring")

SLOT_NAMES = {
    "weapon": "武器",
    "helm": "头盔",
    "chest": "胸甲",
    "gloves": "手套",
    "boots": "靴子",
    "ring": "戒指",
}

RARITY_ORDER = ("普通", "魔法", "稀有", "传奇")

RARITIES = {
    "普通": {
        "color": "白",
        "drop_weight": 50,
        "affix_count": (1, 2),
        "value_mult": 1.0,
    },
    "魔法": {
        "color": "蓝",
        "drop_weight": 30,
        "affix_count": (2, 3),
        "value_mult": 1.6,
    },
    "稀有": {
        "color": "黄",
        "drop_weight": 15,
        "affix_count": (3, 4),
        "value_mult": 2.4,
    },
    "传奇": {
        "color": "橙",
        "drop_weight": 5,
        "affix_count": (4, 5),
        "value_mult": 3.8,
    },
}

# 百分比类词缀（锻造加成适用）
PERCENT_AFFIX_KEYS = frozenset({"crit_rate", "crit_damage", "skill_damage"})

# 各部位允许词缀 — hp_regen/resource_regen 仅装备/技能获得
SLOT_AFFIX_ALLOWED: dict[str, tuple[str, ...]] = {
    "weapon": ("attack", "crit_rate", "crit_damage", "skill_damage"),
    "helm": ("defense", "max_hp", "crit_rate", "hp_regen"),
    "chest": ("defense", "max_hp", "hp_regen"),
    "gloves": ("attack", "crit_rate", "skill_damage", "resource_regen"),
    "boots": ("defense", "max_hp", "hp_regen"),
    "ring": (
        "attack", "defense", "max_hp",
        "crit_rate", "crit_damage", "skill_damage",
        "hp_regen", "resource_regen",
    ),
}

# stat_key, 显示名, 是否百分比, 基础范围 — 大幅提升装备数值
AFFIX_DEFINITIONS = {
    "attack": ("攻击", False, (12, 35)),
    "defense": ("防御", False, (6, 18)),
    "max_hp": ("生命", False, (40, 120)),
    "crit_rate": ("暴击率", True, (0.03, 0.08)),
    "crit_damage": ("暴击伤害", True, (0.08, 0.18)),
    "skill_damage": ("技能伤害", True, (0.06, 0.15)),
    "hp_regen": ("每回合回血", False, (3, 10)),
    "resource_regen": ("每回合回能", False, (4, 12)),
}

BASE_EXP = 100
EXP_GROWTH = 1.45

MAX_FLOOR = 50
FLOOR_HP_BASE = 55
FLOOR_HP_GROWTH = 1.32
FLOOR_ATK_BASE = 8
FLOOR_ATK_GROWTH = 1.22
BOSS_FLOOR_INTERVAL = 10
ELITE_HP_MULT = 1.6
ELITE_ATK_MULT = 1.35
BOSS_HP_MULT = 3.5
BOSS_ATK_MULT = 1.8

DROP_CHANCE_NORMAL = 0.75
DROP_CHANCE_ELITE = 0.90
DROP_CHANCE_BOSS = 1.0

# 锻造材料掉落（按层数决定品质，数量为区间）
def roll_forge_material_drops(floor: int, is_boss: bool, is_elite: bool) -> dict[str, int]:
    """根据层数掉落分级锻造材料。"""
    import random
    from config.forge import MATERIAL_TIERS, empty_material_bag

    bag = empty_material_bag()
    if floor <= 10:
        primary, secondary = "普通", None
    elif floor <= 20:
        primary, secondary = "稀有", "普通"
    elif floor <= 30:
        primary, secondary = "史诗", "稀有"
    else:
        primary, secondary = "传说", "史诗"

    if is_boss:
        lo, hi = 3, 6
        sec_lo, sec_hi = 1, 3
    elif is_elite:
        lo, hi = 2, 4
        sec_lo, sec_hi = 0, 2
    else:
        lo, hi = 1, 2
        sec_lo, sec_hi = 0, 1

    bag[primary] += random.randint(lo, hi)
    if secondary and random.random() < (0.6 if is_boss else 0.35):
        if sec_hi > 0:
            bag[secondary] += random.randint(max(1, sec_lo), sec_hi)
    return bag


def merge_material_bags(a: dict[str, int], b: dict[str, int]) -> dict[str, int]:
    from config.forge import MATERIAL_TIERS
    return {t: a.get(t, 0) + b.get(t, 0) for t in MATERIAL_TIERS}

BATTLE_ACTION_DELAY = 0.35
BATTLE_TURN_DELAY = 0.55
SAVE_DIR_NAME = "saves"


def get_available_rarities(floor: int) -> list[str]:
    tier = min(len(RARITY_ORDER), max(1, (floor - 1) // 10 + 1))
    return list(RARITY_ORDER[:tier])


def get_drop_chance(is_boss: bool, is_elite: bool) -> float:
    if is_boss:
        return DROP_CHANCE_BOSS
    if is_elite:
        return DROP_CHANCE_ELITE
    return DROP_CHANCE_NORMAL

INVENTORY_MAX = 30
