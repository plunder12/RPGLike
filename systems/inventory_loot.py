"""战利品入包：允许超限、自动出售/分解劣品。"""

from config.constants import INVENTORY_MAX
from models.character import Character
from models.equipment import Equipment
from systems.equipment_compare import compare_tag
from systems.equipment_shop import calc_dismantle_reward, calc_sell_price


def can_enter_dungeon(char: Character) -> tuple[bool, str]:
    count = len(char.inventory)
    if count > INVENTORY_MAX:
        return False, f"背包超载（{count}/{INVENTORY_MAX}），请先清理至上限内再进入地牢"
    return True, ""


def is_worse_than_equipped(char: Character, item: Equipment) -> bool:
    old = char.equipment.get(item.slot)
    if not old:
        return False
    flv = char.forge_levels.get(item.slot, 0)
    return compare_tag(item, old, flv) == "[↓降低]"


def normalize_auto_loot(char: Character) -> bool:
    """自动出售/分解二选一；若存档两项同为 True 则保留出售。"""
    if char.auto_sell_worse and char.auto_dismantle_worse:
        char.auto_dismantle_worse = False
        return True
    return False


def add_loot_to_character(char: Character, loot: Equipment) -> dict:
    """处理单件掉落，返回 {action, summary, rarity, ...}。"""
    base = {"summary": loot.summary(), "rarity": loot.rarity}

    if char.auto_sell_worse and is_worse_than_equipped(char, loot):
        gold = calc_sell_price(loot)
        char.gold += gold
        return {**base, "action": "sold", "gold": gold}

    elif char.auto_dismantle_worse and is_worse_than_equipped(char, loot):
        tier, qty = calc_dismantle_reward(loot)
        char.forge_materials[tier] = char.forge_materials.get(tier, 0) + qty
        return {**base, "action": "dismantled", "tier": tier, "qty": qty}

    char.inventory.append(loot)
    return {**base, "action": "kept"}
