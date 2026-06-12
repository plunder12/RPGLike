"""游戏主菜单与交互。"""

from config.classes import list_classes, get_class_config
from config.constants import EQUIPMENT_SLOTS, INVENTORY_MAX, SLOT_NAMES
from config.forge import FORGE_SLOT_CONFIG, format_material_bag
from config.skills import get_class_skill_tree
from models.character import Character
from systems.battle import BattleSystem
from systems.equipment_compare import compare_equipment, compare_tag
from systems.equipment_shop import (
    bulk_dismantle,
    bulk_sell,
    dismantle_equipment,
    format_material_totals,
    preview_bulk_dismantle,
    preview_bulk_sell,
    preview_dismantle,
    preview_sell,
    sell_equipment,
)
from systems.forge import do_forge, format_forge_cost
from systems.save_manager import SaveManager
from ui.skill_display import format_skill_rank_values


class GameMenu:
    def __init__(self):
        self.save_mgr = SaveManager()
        self.character: Character | None = None
        self.battle = BattleSystem()

    def run(self) -> None:
        self._print_title()
        while True:
            if self.character is None:
                if not self._title_menu():
                    break
            else:
                result = self._main_menu()
                if result == "quit":
                    break
                if result == "title":
                    self.character = None

    def _print_title(self) -> None:
        print("\n" + "=" * 44)
        print("     文字暗黑 · 无限爬塔  v0.3")
        print("     技能点 | 锻造 | 刷装备爬塔")
        print("=" * 44)

    def _title_menu(self) -> bool:
        print("\n[标题菜单]")
        print("  1. 创建角色")
        print("  2. 选择角色")
        print("  3. 删除角色")
        print("  0. 退出游戏")
        choice = input("请选择: ").strip()

        if choice == "1":
            self._create_character()
        elif choice == "2":
            self._select_character()
        elif choice == "3":
            self._delete_character()
        elif choice == "0":
            print("再见，愿圣光与你同在。")
            return False
        else:
            print("无效输入。")
        return True

    def _create_character(self) -> None:
        name = input("\n输入角色名: ").strip()
        if not name:
            print("角色名不能为空。")
            return
        if self.save_mgr.exists(name):
            print(f"角色 [{name}] 已存在。")
            return

        classes = list_classes()
        print("\n可选职业:")
        for i, cls in enumerate(classes):
            print(f"  [{i + 1}] {cls['name']} - {cls['desc']}")
        try:
            idx = int(input("选择职业编号: ").strip()) - 1
            class_id = classes[idx]["id"]
        except (ValueError, IndexError):
            print("无效选择。")
            return

        self.character = Character.create(name, class_id)
        self.save_mgr.save(self.character)
        cfg = get_class_config(class_id)
        print(f"\n角色 [{name}] ({cfg['name']}) 创建成功！")
        print(f"初始 HP:{self.character.max_hp} ATK:{self.character.attack}")
        print("仅拥有普通攻击，请升级获得技能点学习技能。")

    def _select_character(self) -> None:
        chars = self.save_mgr.list_characters()
        if not chars:
            print("\n暂无存档，请先创建角色。")
            return

        print("\n[角色列表]")
        for i, c in enumerate(chars):
            cls_name = (
                get_class_config(c["class_name"])["name"]
                if c["class_name"] in ("barbarian", "wizard", "monk")
                else c["class_name"]
            )
            print(
                f"  [{i + 1}] {c['name']} | {cls_name} | "
                f"Lv.{c['level']} | 最高层:{c['floor']}"
            )
        try:
            idx = int(input("选择角色编号: ").strip()) - 1
            name = chars[idx]["name"]
        except (ValueError, IndexError):
            print("无效选择。")
            return

        self.character = self.save_mgr.load(name)
        if self.character:
            print(f"\n欢迎回来，{self.character.name}！")
        else:
            print("加载失败。")

    def _delete_character(self) -> None:
        chars = self.save_mgr.list_characters()
        if not chars:
            print("\n暂无存档。")
            return
        for i, c in enumerate(chars):
            print(f"  [{i + 1}] {c['name']}")
        try:
            idx = int(input("选择要删除的角色编号: ").strip()) - 1
            name = chars[idx]["name"]
        except (ValueError, IndexError):
            print("无效选择。")
            return
        confirm = input(f"确认删除 [{name}]? (y/N): ").strip().lower()
        if confirm == "y":
            self.save_mgr.delete(name)
            print("已删除。")

    def _main_menu(self) -> str:
        """返回 continue | title | quit"""
        c = self.character
        print(
            f"\n[主菜单] {c.name} ({c.class_name}) Lv.{c.level} | "
            f"第{c.floor}层 | 金币:{c.gold} | 技能点:{c.skill_points}"
        )
        print(f"  材料: {c.materials_summary}")
        print("  1. 挑战爬塔")
        print("  2. 角色状态")
        print("  3. 背包与装备")
        print("  4. 技能学习")
        print("  5. 装备锻造")
        print("  6. 保存并返回")
        print("  0. 保存并退出")
        choice = input("请选择: ").strip()

        if choice == "1":
            self._tower_menu()
        elif choice == "2":
            self._show_status()
        elif choice == "3":
            self._inventory_menu()
        elif choice == "4":
            self._skill_menu()
        elif choice == "5":
            self._forge_menu()
        elif choice == "6":
            self._auto_save()
            self.character = None
            print("已保存，返回标题。")
            return "title"
        elif choice == "0":
            self._auto_save()
            print("游戏已保存，再见！")
            return "quit"
        else:
            print("无效输入。")
        return "continue"

    def _tower_menu(self) -> None:
        from config.constants import MAX_FLOOR

        c = self.character
        cleared = max(0, c.highest_floor)
        at_max = c.highest_floor >= MAX_FLOOR
        print(f"\n[爬塔] 当前挑战: 第 {min(c.floor, MAX_FLOOR)} 层 | 已通关: 1~{cleared} 层 | 最高{MAX_FLOOR}层")
        if at_max:
            print("  ★ 已通关全部层数，可回顾刷层继续收集装备 ★")
        if not at_max:
            print("  1. 推进爬塔（挑战当前层）")
        if cleared >= 1:
            print(f"  2. 回顾刷层（重复挑战 1~{min(cleared, MAX_FLOOR)} 层刷装备）")
        print("  0. 返回")
        choice = input("请选择: ").strip()

        if choice == "0":
            return
        if choice == "1" and not at_max:
            target_floor = min(c.floor, MAX_FLOOR)
        elif choice == "2" and cleared >= 1:
            target_floor = self._choose_farm_floor(min(cleared, MAX_FLOOR))
            if target_floor is None:
                return
        else:
            print("无效输入。")
            return

        result = self.battle.run_floor(c, target_floor=target_floor)
        print(f"\n{result['message']}")
        if result["victory"]:
            replay_note = "（刷层奖励）" if result.get("is_replay") else ""
            mat_str = format_material_bag(result.get("materials", {}))
            print(
                f"获得经验 +{result['exp']} | 金币 +{result['gold']} | "
                f"材料 +{mat_str} {replay_note}"
            )
            for msg in result.get("level_msgs", []):
                print(msg)
            if result.get("loot"):
                print(f"掉落装备: {result['loot'].summary()}")
                action = result.get("loot_action")
                if action == "sold":
                    print(f"（自动出售，+{result.get('loot_sold_gold', 0)} 金币）")
                elif action == "dismantled":
                    d = result.get("loot_dismantled") or {}
                    print(f"（自动分解，+{d.get('qty', 0)} 个{d.get('tier', '')}材料）")
        self._auto_save()

    def _choose_farm_floor(self, cleared: int) -> int | None:
        print(f"\n[回顾刷层] 可选 1 ~ {cleared} 层（重复挑战不掉进度，经验/金币 50%）")
        print("  输入层数直接挑战，或 0 返回")
        raw = input("请选择层数: ").strip()
        if raw == "0":
            return None
        try:
            floor = int(raw)
            if 1 <= floor <= cleared:
                return floor
        except ValueError:
            pass
        print("无效层数。")
        return None

    def _show_status(self) -> None:
        c = self.character
        stats = c.total_stats()
        print(f"\n{'=' * 40}")
        print(f"  {c.name} | {c.class_name} | Lv.{c.level}")
        print(f"  经验: {c.exp}/{c.exp_to_next()} | 技能点: {c.skill_points}")
        print(f"  HP: {c.hp}/{stats.max_hp} | 每回合回血: {stats.hp_regen}")
        print(
            f"  {c.resource_name}: {c.resource}/{c.resource_max} | "
            f"每回合回能: {stats.resource_regen}"
        )
        print(f"  攻击:{stats.attack}  防御:{stats.defense}")
        print(f"  暴击率:{stats.crit_rate*100:.1f}%  暴击伤:{stats.crit_damage*100:.0f}%")
        print(f"  技能伤加成:{stats.skill_damage*100:.1f}%")
        print(f"  层数:{c.floor}/{c.highest_floor}  金币:{c.gold}")
        print(f"  材料: {c.materials_summary}")
        print("-" * 40)
        print("  已装备:")
        for slot, item in c.equipment.items():
            slot_cn = SLOT_NAMES.get(slot, slot)
            flv = c.forge_levels.get(slot, 0)
            text = item.summary() if item else "（空）"
            forge_tag = f" [锻造Lv.{flv}]" if flv else ""
            print(f"    {slot_cn}{forge_tag}: {text}")
        print("=" * 40)

    def _skill_menu(self) -> None:
        c = self.character
        tree = get_class_skill_tree(c.class_id)
        while True:
            print(f"\n[技能学习] 可用技能点: {c.skill_points}")
            print("  · 普通攻击（初始）| 伤害倍率: 1.00x | 每回合回能+10")
            for i, tmpl in enumerate(tree):
                rank = c.get_skill_rank(tmpl.id)
                type_cn = "主动" if tmpl.skill_type == "active" else "被动"
                status = f"Lv.{rank}/{tmpl.max_rank}" if rank else "未学习"
                print(f"  [{i + 1}] [{type_cn}] {tmpl.name} ({status})")
                print(f"       {tmpl.desc}")
                print(f"       数值: {format_skill_rank_values(tmpl)}")
            print("\n  输入编号 → 学习(+1级) | U+编号 → 回退(-1级)")
            print("  R. 重置全部技能  |  0. 返回")
            raw = input("请选择: ").strip().upper()
            if raw == "0":
                break
            if raw == "R":
                confirm = input("确认重置全部已学技能? (y/N): ").strip().lower()
                if confirm == "y":
                    ok, msg = c.reset_all_skills()
                    print(msg)
                    if ok:
                        self._auto_save()
                continue
            if raw.startswith("U"):
                num_part = raw[1:].strip()
                if not num_part:
                    num_part = input("输入要回退的技能编号: ").strip()
                try:
                    idx = int(num_part) - 1
                    tmpl = tree[idx]
                except (ValueError, IndexError):
                    print("无效编号。")
                    continue
                ok, msg = c.unlearn_skill(tmpl.id)
                print(msg)
                if ok:
                    self._auto_save()
                continue
            try:
                idx = int(raw) - 1
                tmpl = tree[idx]
            except (ValueError, IndexError):
                print("无效输入。")
                continue
            ok, msg = c.learn_skill(tmpl.id)
            print(msg)
            if ok:
                self._auto_save()

    def _forge_menu(self) -> None:
        c = self.character
        while True:
            print(f"\n[装备锻造] 金币:{c.gold} | 材料: {c.materials_summary}")
            print("  锻造 +1~10普通 +11~20稀有 +21~30史诗 +31+传说")
            for i, slot in enumerate(EQUIPMENT_SLOTS):
                slot_cn = SLOT_NAMES.get(slot, slot)
                lv = c.forge_levels.get(slot, 0)
                cfg = FORGE_SLOT_CONFIG.get(slot, {})
                cost = format_forge_cost(c, slot)
                print(f"  [{i + 1}] {slot_cn} Lv.{lv} | 下次: {cost}")
                print(f"       {cfg.get('desc', '')}")
            print("  0. 返回")
            raw = input("选择锻造部位: ").strip()
            if raw == "0":
                break
            try:
                idx = int(raw) - 1
                slot = EQUIPMENT_SLOTS[idx]
            except (ValueError, IndexError):
                print("无效编号。")
                continue
            msg = do_forge(c, slot)
            print(msg)
            self._auto_save()

    def _print_equipped_gear(self) -> None:
        c = self.character
        print("\n  --- 当前装备 ---")
        for slot in EQUIPMENT_SLOTS:
            slot_cn = SLOT_NAMES.get(slot, slot)
            item = c.equipment.get(slot)
            flv = c.forge_levels.get(slot, 0)
            if item:
                forge_note = f" (锻造+{flv*10}%)" if flv else ""
                print(f"  {slot_cn}{forge_note}: {item.summary()}")
            else:
                print(f"  {slot_cn}: （空）")

    def _inventory_menu(self) -> None:
        c = self.character
        while True:
            print(f"\n[背包] {len(c.inventory)}/{INVENTORY_MAX}")
            self._print_equipped_gear()
            if not c.inventory:
                print("\n  背包为空。")
            else:
                print("\n  --- 背包物品 ---")
                for i, item in enumerate(c.inventory):
                    old = c.equipment.get(item.slot)
                    flv = c.forge_levels.get(item.slot, 0)
                    tag = compare_tag(item, old, flv)
                    print(
                        f"  [{i + 1}] {tag} {item.summary()} "
                        f"| {preview_sell(item)} | {preview_dismantle(item)}"
                    )
            print("\n  E. 装备物品（含属性对比）")
            print("  C. 查看物品对比详情")
            print("  S. 售卖物品  |  SA. 一键售卖全部")
            print("  F. 分解物品  |  FA. 一键分解全部")
            print("  D. 丢弃物品  |  DA. 一键丢弃全部")
            print("  B. 返回")
            choice = input("请选择: ").strip().upper()

            if choice == "B":
                break
            elif choice == "E":
                self._equip_from_inventory()
            elif choice == "C":
                self._compare_inventory_item()
            elif choice == "S":
                self._sell_from_inventory()
            elif choice == "SA":
                self._sell_all_from_inventory()
            elif choice == "F":
                self._dismantle_from_inventory()
            elif choice == "FA":
                self._dismantle_all_from_inventory()
            elif choice == "D":
                self._discard_from_inventory()
            elif choice == "DA":
                self._discard_all_from_inventory()
            else:
                print("无效输入。")

    def _compare_inventory_item(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        try:
            idx = int(input("输入物品编号: ").strip()) - 1
            item = c.inventory[idx]
        except (ValueError, IndexError):
            print("无效编号。")
            return
        old = c.equipment.get(item.slot)
        flv = c.forge_levels.get(item.slot, 0)
        slot_cn = SLOT_NAMES.get(item.slot, item.slot)
        print(f"\n[对比] {slot_cn}")
        print(f"  新: {item.summary()}")
        if old:
            print(f"  旧: {old.summary()}")
        else:
            print("  旧: （无装备）")
        print(f"  {compare_tag(item, old, flv)}")
        lines = compare_equipment(item, old, flv)
        if lines:
            print("  属性变化:")
            for line in lines:
                print(line)
        else:
            print("  无属性差异")

    def _equip_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        try:
            idx = int(input("输入物品编号: ").strip()) - 1
            item = c.inventory[idx]
        except (ValueError, IndexError):
            print("无效编号。")
            return

        old = c.equipment.get(item.slot)
        flv = c.forge_levels.get(item.slot, 0)
        slot_cn = SLOT_NAMES.get(item.slot, item.slot)
        print(f"\n[{slot_cn}] 装备对比 {compare_tag(item, old, flv)}")
        for line in compare_equipment(item, old, flv):
            print(line)

        confirm = input("确认装备? (Y/n): ").strip().lower()
        if confirm == "n":
            print("已取消。")
            return

        c.inventory.pop(idx)
        old = c.equip_item(item)
        print(f"已装备: {item.summary()}")
        if old:
            c.inventory.append(old)
            print(f"旧装备放入背包: {old.summary()}")
        self._auto_save()

    def _sell_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        try:
            idx = int(input("输入要售卖的物品编号: ").strip()) - 1
            item = c.inventory[idx]
        except (ValueError, IndexError):
            print("无效编号。")
            return
        print(f"{preview_sell(item)} | {preview_dismantle(item)}")
        if input("确认售卖? (Y/n): ").strip().lower() == "n":
            print("已取消。")
            return
        c.inventory.pop(idx)
        _, msg = sell_equipment(c, item)
        print(msg)
        self._auto_save()

    def _dismantle_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        try:
            idx = int(input("输入要分解的物品编号: ").strip()) - 1
            item = c.inventory[idx]
        except (ValueError, IndexError):
            print("无效编号。")
            return
        print(f"{preview_sell(item)} | {preview_dismantle(item)}")
        if input("确认分解? (Y/n): ").strip().lower() == "n":
            print("已取消。")
            return
        c.inventory.pop(idx)
        _, msg = dismantle_equipment(c, item)
        print(msg)
        self._auto_save()

    def _discard_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        try:
            idx = int(input("输入要丢弃的物品编号: ").strip()) - 1
            item = c.inventory.pop(idx)
            print(f"已丢弃: {item.summary()}")
            self._auto_save()
        except (ValueError, IndexError):
            print("无效编号。")

    def _discard_all_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        count = len(c.inventory)
        if input(f"确认丢弃全部 {count} 件装备? (y/N): ").strip().lower() != "y":
            print("已取消。")
            return
        c.inventory.clear()
        print(f"已丢弃全部 {count} 件装备。")
        self._auto_save()

    def _sell_all_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        items = list(c.inventory)
        total_gold = preview_bulk_sell(items)
        print(f"共 {len(items)} 件，预计获得 {total_gold} 金币")
        if input("确认一键售卖全部? (y/N): ").strip().lower() != "y":
            print("已取消。")
            return
        count, gold = bulk_sell(c, items)
        c.inventory.clear()
        print(f"已售卖 {count} 件装备，获得 {gold} 金币")
        self._auto_save()

    def _dismantle_all_from_inventory(self) -> None:
        c = self.character
        if not c.inventory:
            print("背包为空。")
            return
        items = list(c.inventory)
        preview = preview_bulk_dismantle(items)
        print(f"共 {len(items)} 件，预计获得材料: {format_material_totals(preview)}")
        if input("确认一键分解全部? (y/N): ").strip().lower() != "y":
            print("已取消。")
            return
        count, totals = bulk_dismantle(c, items)
        c.inventory.clear()
        print(f"已分解 {count} 件装备，获得 {format_material_totals(totals)}")
        self._auto_save()

    def _auto_save(self) -> None:
        if self.character:
            self.save_mgr.save(self.character)
