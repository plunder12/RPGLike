"""游戏控制器 — CLI / Web 共用业务层。"""

from config.classes import get_class_config, list_classes
from config.constants import EQUIPMENT_SLOTS, MAX_FLOOR, SLOT_NAMES
from config.forge import FORGE_SLOT_CONFIG, format_material_bag
from config.skills import get_class_skill_tree, get_skill
from models.character import Character
from models.equipment import Equipment
from systems.battle import BattleSystem
from systems.battle_io import CollectingBattleIO
from systems.equipment_compare import compare_tag
from systems.equipment_shop import (
    bulk_dismantle,
    bulk_sell,
    calc_dismantle_reward,
    calc_sell_price,
    dismantle_equipment,
    format_material_totals,
    preview_bulk_dismantle,
    preview_bulk_sell,
    sell_equipment,
)
from systems.forge import do_forge, format_forge_cost
from systems.save_manager import SaveManager
from ui.skill_display import format_skill_rank_values


class GameController:
    def __init__(self) -> None:
        self.save_mgr = SaveManager()

    def list_classes(self) -> list[dict]:
        return [
            {"id": c["id"], "name": c["name"], "desc": c["desc"]}
            for c in list_classes()
        ]

    def list_characters(self) -> list[dict]:
        chars = self.save_mgr.list_characters()
        for c in chars:
            cid = c.get("class_name", "")
            if cid in ("barbarian", "wizard", "monk"):
                c["class_display"] = get_class_config(cid)["name"]
            else:
                c["class_display"] = cid
        return chars

    def create_character(self, name: str, class_id: str) -> dict:
        name = name.strip()
        if not name:
            raise ValueError("角色名不能为空")
        if self.save_mgr.exists(name):
            raise ValueError(f"角色 [{name}] 已存在")
        get_class_config(class_id)
        char = Character.create(name, class_id)
        self.save_mgr.save(char)
        return self.character_to_api(char)

    def load_character(self, name: str) -> dict:
        char = self._require_char(name)
        return self.character_to_api(char)

    def delete_character(self, name: str) -> bool:
        return self.save_mgr.delete(name)

    def run_battle(self, name: str, target_floor: int | None = None) -> dict:
        char = self._require_char(name)
        if target_floor is None:
            target_floor = min(char.floor, MAX_FLOOR)
        io = CollectingBattleIO()
        battle = BattleSystem(io=io)
        result = battle.run_floor(char, target_floor=target_floor)
        self.save_mgr.save(char)
        return self._pack_battle_result(result, io.timeline, char)

    def learn_skill(self, name: str, skill_id: str) -> dict:
        char = self._require_char(name)
        ok, msg = char.learn_skill(skill_id)
        if not ok:
            raise ValueError(msg)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def unlearn_skill(self, name: str, skill_id: str) -> dict:
        char = self._require_char(name)
        ok, msg = char.unlearn_skill(skill_id)
        if not ok:
            raise ValueError(msg)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def reset_skills(self, name: str) -> dict:
        char = self._require_char(name)
        ok, msg = char.reset_all_skills()
        if not ok:
            raise ValueError(msg)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def equip_item(self, name: str, inventory_index: int) -> dict:
        char = self._require_char(name)
        if inventory_index < 0 or inventory_index >= len(char.inventory):
            raise ValueError("无效背包编号")
        item = char.inventory.pop(inventory_index)
        old = char.equip_item(item)
        if old:
            char.inventory.append(old)
        self.save_mgr.save(char)
        return {"message": f"已装备 {item.name}", "character": self.character_to_api(char)}

    def sell_item(self, name: str, inventory_index: int) -> dict:
        char = self._require_char(name)
        item = self._pop_item(char, inventory_index)
        _, msg = sell_equipment(char, item)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def dismantle_item(self, name: str, inventory_index: int) -> dict:
        char = self._require_char(name)
        item = self._pop_item(char, inventory_index)
        _, msg = dismantle_equipment(char, item)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def sell_all(self, name: str) -> dict:
        char = self._require_char(name)
        items = list(char.inventory)
        if not items:
            raise ValueError("背包为空")
        count, gold = bulk_sell(char, items)
        char.inventory.clear()
        self.save_mgr.save(char)
        return {
            "message": f"售卖 {count} 件，获得 {gold} 金币",
            "character": self.character_to_api(char),
        }

    def dismantle_all(self, name: str) -> dict:
        char = self._require_char(name)
        items = list(char.inventory)
        if not items:
            raise ValueError("背包为空")
        count, totals = bulk_dismantle(char, items)
        char.inventory.clear()
        self.save_mgr.save(char)
        return {
            "message": f"分解 {count} 件，获得 {format_material_totals(totals)}",
            "character": self.character_to_api(char),
        }

    def forge_slot(self, name: str, slot: str) -> dict:
        char = self._require_char(name)
        msg = do_forge(char, slot)
        if "不足" in msg or "无效" in msg or "最大" in msg:
            raise ValueError(msg)
        self.save_mgr.save(char)
        return {"message": msg, "character": self.character_to_api(char)}

    def get_skills(self, name: str) -> list[dict]:
        char = self._require_char(name)
        tree = []
        for tmpl in get_class_skill_tree(char.class_id):
            rank = char.get_skill_rank(tmpl.id)
            tree.append({
                "id": tmpl.id,
                "name": tmpl.name,
                "desc": tmpl.desc,
                "type": tmpl.skill_type,
                "rank": rank,
                "max_rank": tmpl.max_rank,
                "values": format_skill_rank_values(tmpl),
            })
        return tree

    def character_to_api(self, char: Character) -> dict:
        stats = char.total_stats()
        equipment = {}
        for slot in EQUIPMENT_SLOTS:
            item = char.equipment.get(slot)
            flv = char.forge_levels.get(slot, 0)
            equipment[slot] = {
                "slot_name": SLOT_NAMES.get(slot, slot),
                "forge_level": flv,
                "item": {"summary": item.summary()} if item else None,
            }
        inventory = []
        for i, item in enumerate(char.inventory):
            old = char.equipment.get(item.slot)
            flv = char.forge_levels.get(item.slot, 0)
            inventory.append({
                "index": i,
                "summary": item.summary(),
                "rarity": item.rarity,
                "slot": item.slot,
                "compare": compare_tag(item, old, flv),
                "sell_gold": calc_sell_price(item),
                "dismantle_tier": calc_dismantle_reward(item)[0],
                "dismantle_qty": calc_dismantle_reward(item)[1],
            })
        forge_slots = []
        for slot in EQUIPMENT_SLOTS:
            forge_slots.append({
                "slot": slot,
                "slot_name": SLOT_NAMES.get(slot, slot),
                "level": char.forge_levels.get(slot, 0),
                "cost": format_forge_cost(char, slot),
                "desc": FORGE_SLOT_CONFIG.get(slot, {}).get("desc", ""),
            })
        return {
            "name": char.name,
            "class_id": char.class_id,
            "class_name": char.class_name,
            "level": char.level,
            "exp": char.exp,
            "exp_to_next": char.exp_to_next(),
            "floor": char.floor,
            "highest_floor": char.highest_floor,
            "max_floor": MAX_FLOOR,
            "gold": char.gold,
            "skill_points": char.skill_points,
            "materials": dict(char.forge_materials),
            "materials_summary": char.materials_summary,
            "resource_name": char.resource_name,
            "stats": {
                "hp": char.hp,
                "max_hp": stats.max_hp,
                "attack": stats.attack,
                "defense": stats.defense,
                "crit_rate": round(stats.crit_rate, 4),
                "crit_damage": round(stats.crit_damage, 4),
                "skill_damage": round(stats.skill_damage, 4),
                "hp_regen": stats.hp_regen,
                "resource_regen": stats.resource_regen,
            },
            "equipment": equipment,
            "inventory": inventory,
            "forge_slots": forge_slots,
            "can_push": char.highest_floor < MAX_FLOOR,
        }

    def _pack_battle_result(self, result: dict, timeline: list, char: Character) -> dict:
        loot = None
        if result.get("loot"):
            loot = {"summary": result["loot"].summary(), "rarity": result["loot"].rarity}
        return {
            "victory": result["victory"],
            "message": result["message"],
            "exp": result.get("exp", 0),
            "gold": result.get("gold", 0),
            "materials": result.get("materials", {}),
            "loot": loot,
            "loot_overflow": result.get("loot_overflow", False),
            "level_msgs": result.get("level_msgs", []),
            "timeline": timeline,
            "character": self.character_to_api(char),
        }

    def _require_char(self, name: str) -> Character:
        char = self.save_mgr.load(name)
        if not char:
            raise ValueError(f"角色 [{name}] 不存在")
        return char

    def _pop_item(self, char: Character, index: int) -> Equipment:
        if index < 0 or index >= len(char.inventory):
            raise ValueError("无效背包编号")
        return char.inventory.pop(index)
