"""锻造配置 — 按部位强化，与具体装备无关。"""

# 锻造材料分级（下一级所属区间决定消耗哪种材料）
MATERIAL_TIERS = ("普通", "稀有", "史诗", "传说")

# 每级锻造：固定属性 + 该部位装备百分比词缀额外 +10%/级
FORGE_PERCENT_PER_LEVEL = 0.10
MAX_FORGE_LEVEL = 50

FORGE_SLOT_CONFIG = {
    "weapon": {
        "fixed_per_level": {"attack": 15},
        "desc": "每级 +15 攻击，武器词缀 +10%/级",
    },
    "helm": {
        "fixed_per_level": {"max_hp": 80},
        "desc": "每级 +80 生命，头盔词缀 +10%/级",
    },
    "chest": {
        "fixed_per_level": {"max_hp": 120, "defense": 8},
        "desc": "每级 +120 生命 +8 防御，胸甲词缀 +10%/级",
    },
    "gloves": {
        "fixed_per_level": {"attack": 10},
        "desc": "每级 +10 攻击，手套词缀 +10%/级",
    },
    "boots": {
        "fixed_per_level": {"max_hp": 60, "defense": 5},
        "desc": "每级 +60 生命 +5 防御，靴子词缀 +10%/级",
    },
    "ring": {
        "fixed_per_level": {"max_hp": 40, "attack": 8},
        "desc": "每级 +40 生命 +8 攻击，戒指词缀 +10%/级",
    },
}


def get_forge_tier(next_level: int) -> str:
    """锻造目标等级（+1 后）决定材料品质。"""
    if next_level <= 10:
        return "普通"
    if next_level <= 20:
        return "稀有"
    if next_level <= 30:
        return "史诗"
    return "传说"


def forge_gold_cost(current_level: int) -> int:
    tier = get_forge_tier(current_level + 1)
    base = { "普通": 80, "稀有": 200, "史诗": 450, "传说": 900 }[tier]
    return base + current_level * (30 if tier == "普通" else 50)


def forge_material_cost(current_level: int) -> tuple[str, int]:
    """返回 (材料品质, 数量)。"""
    next_lv = current_level + 1
    tier = get_forge_tier(next_lv)
    tier_index = MATERIAL_TIERS.index(tier)
    # 同档内随等级增加消耗
    within = (next_lv - 1) % 10 + 1
    qty = within if tier == "普通" else within + tier_index * 2
    return tier, qty


def empty_material_bag() -> dict[str, int]:
    return {t: 0 for t in MATERIAL_TIERS}


def format_material_bag(materials: dict[str, int]) -> str:
    parts = [f"{t}:{materials.get(t, 0)}" for t in MATERIAL_TIERS if materials.get(t, 0)]
    return " ".join(parts) if parts else "无"
