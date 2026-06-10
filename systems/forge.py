"""锻造逻辑。"""

from config.constants import EQUIPMENT_SLOTS, SLOT_NAMES
from config.forge import (
    FORGE_SLOT_CONFIG,
    MAX_FORGE_LEVEL,
    forge_gold_cost,
    forge_material_cost,
    get_forge_tier,
)
from models.character import Character


def can_forge(character: Character, slot: str) -> tuple[bool, str]:
    if slot not in EQUIPMENT_SLOTS:
        return False, "无效部位"
    level = character.forge_levels.get(slot, 0)
    if level >= MAX_FORGE_LEVEL:
        return False, f"该部位已达最大锻造等级 {MAX_FORGE_LEVEL}"
    gold = forge_gold_cost(level)
    tier, mats = forge_material_cost(level)
    if character.gold < gold:
        return False, f"金币不足（需要 {gold}）"
    if character.forge_materials.get(tier, 0) < mats:
        return False, f"{tier}材料不足（需要 {mats}，当前 {character.forge_materials.get(tier, 0)}）"
    return True, ""


def do_forge(character: Character, slot: str) -> str:
    ok, msg = can_forge(character, slot)
    if not ok:
        return msg

    level = character.forge_levels.get(slot, 0)
    gold = forge_gold_cost(level)
    tier, mats = forge_material_cost(level)

    character.gold -= gold
    character.forge_materials[tier] -= mats
    character.forge_levels[slot] = level + 1
    new_level = level + 1

    slot_cn = SLOT_NAMES.get(slot, slot)
    next_tier = get_forge_tier(new_level + 1) if new_level < MAX_FORGE_LEVEL else "已满"
    return (
        f"{slot_cn} 锻造成功！Lv.{new_level}/{MAX_FORGE_LEVEL} | "
        f"消耗 {gold}金 +{mats}{tier}材料 | "
        f"该部位装备词缀 +{new_level * 10}% | "
        f"下级需: {next_tier}材料"
    )


def format_forge_cost(character: Character, slot: str) -> str:
    level = character.forge_levels.get(slot, 0)
    if level >= MAX_FORGE_LEVEL:
        return "已满级"
    gold = forge_gold_cost(level)
    tier, mats = forge_material_cost(level)
    have = character.forge_materials.get(tier, 0)
    return f"{gold}金 +{mats}{tier}(有{have})"
