"""装备售卖与分解。"""

from models.character import Character
from models.equipment import Equipment

# 装备品质 -> 锻造材料品质
RARITY_TO_MATERIAL = {
    "普通": "普通",
    "魔法": "稀有",
    "稀有": "史诗",
    "传奇": "传说",
}

# 售卖基础金币（再 + floor 系数）
SELL_GOLD_BASE = {
    "普通": 20,
    "魔法": 55,
    "稀有": 130,
    "传奇": 320,
}

SELL_GOLD_FLOOR_MULT = {
    "普通": 2,
    "魔法": 4,
    "稀有": 8,
    "传奇": 15,
}

# 分解获得材料数量
DISMANTLE_MAT_QTY = {
    "普通": 1,
    "魔法": 1,
    "稀有": 2,
    "传奇": 3,
}


def calc_sell_price(item: Equipment) -> int:
    base = SELL_GOLD_BASE.get(item.rarity, 15)
    mult = SELL_GOLD_FLOOR_MULT.get(item.rarity, 2)
    return base + item.floor * mult


def calc_dismantle_reward(item: Equipment) -> tuple[str, int]:
    tier = RARITY_TO_MATERIAL.get(item.rarity, "普通")
    qty = DISMANTLE_MAT_QTY.get(item.rarity, 1)
    # 高层装备额外 +0~1
    if item.floor >= 20 and item.rarity in ("稀有", "传奇"):
        qty += 1
    return tier, qty


def sell_equipment(character: Character, item: Equipment) -> tuple[bool, str]:
    gold = calc_sell_price(item)
    character.gold += gold
    return True, f"售卖 [{item.name}] 获得 {gold} 金币"


def dismantle_equipment(character: Character, item: Equipment) -> tuple[bool, str]:
    tier, qty = calc_dismantle_reward(item)
    character.forge_materials[tier] = character.forge_materials.get(tier, 0) + qty
    return True, f"分解 [{item.name}] 获得 {qty} 个{tier}材料"


def preview_sell(item: Equipment) -> str:
    return f"可售 {calc_sell_price(item)} 金币"


def preview_dismantle(item: Equipment) -> str:
    tier, qty = calc_dismantle_reward(item)
    return f"可分解为 {qty} 个{tier}材料"


def preview_bulk_sell(items: list[Equipment]) -> int:
    return sum(calc_sell_price(item) for item in items)


def preview_bulk_dismantle(items: list[Equipment]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for item in items:
        tier, qty = calc_dismantle_reward(item)
        totals[tier] = totals.get(tier, 0) + qty
    return totals


def format_material_totals(totals: dict[str, int]) -> str:
    parts = [f"{tier}x{qty}" for tier, qty in totals.items() if qty > 0]
    return " ".join(parts) if parts else "无"


def bulk_sell(character: Character, items: list[Equipment]) -> tuple[int, int]:
    """售卖多件，返回 (件数, 总金币)。"""
    total_gold = 0
    for item in items:
        total_gold += calc_sell_price(item)
    character.gold += total_gold
    return len(items), total_gold


def bulk_dismantle(character: Character, items: list[Equipment]) -> tuple[int, dict[str, int]]:
    """分解多件，返回 (件数, 材料汇总)。"""
    totals: dict[str, int] = {}
    for item in items:
        tier, qty = calc_dismantle_reward(item)
        character.forge_materials[tier] = character.forge_materials.get(tier, 0) + qty
        totals[tier] = totals.get(tier, 0) + qty
    return len(items), totals
