"""战斗系统 — 回合制自动战斗。"""

import random
import time

from config.constants import (
    BATTLE_ACTION_DELAY,
    BATTLE_TURN_DELAY,
    MAX_FLOOR,
    get_drop_chance,
    roll_forge_material_drops,
)
from systems.inventory_loot import add_loot_to_character
from models.character import Character
from models.equipment import generate_equipment
from models.monster import Monster, generate_monster
from models.skill import SkillState


class BattleSystem:
    FARM_EXP_RATIO = 0.5

    def __init__(self, io=None):
        self.io = io or ConsoleIO()

    def run_floor(self, character: Character, target_floor: int | None = None) -> dict:
        battle_floor = target_floor if target_floor is not None else character.floor
        is_replay = battle_floor < character.floor

        monster = generate_monster(battle_floor)
        self.io.print_battle_start(character, monster, battle_floor, is_replay)

        active_skills = character.get_active_skills()
        for skill in active_skills:
            skill.reset()
        character._buff_damage = 0.0
        character.resource = min(character.resource_max, character.resource)

        log: list[str] = []
        turn = 0

        while monster.hp > 0 and character.hp > 0:
            turn += 1
            self.io.print_turn_header(character, monster, turn, active_skills)

            regen_log = self._apply_turn_regen(character)
            if regen_log:
                log.append(regen_log)
                self.io.emit(regen_log)

            turn_logs = self._player_turn(character, monster, active_skills)
            for line in turn_logs:
                log.append(line)
                self.io.emit(line)

            if monster.hp <= 0:
                self.io.print_hp_bars(character, monster)
                break

            m_result = self._monster_action(character, monster)
            log.append(m_result)
            self.io.emit(m_result)
            self.io.print_hp_bars(character, monster)

            for skill in active_skills:
                skill.tick_cooldowns()

            character._buff_damage = 0.0
            self.io.pause_turn()

        return self._resolve_battle(
            character, monster, log,
            battle_floor=battle_floor,
            advance_floor=not is_replay,
        )

    def _apply_turn_regen(self, character: Character) -> str:
        stats = character.total_stats()
        parts = []
        if stats.hp_regen > 0:
            before = character.hp
            character.hp = min(character.max_hp, character.hp + stats.hp_regen)
            healed = character.hp - before
            if healed > 0:
                parts.append(f"回血+{healed}")
        if stats.resource_regen > 0:
            before = character.resource
            character.resource = min(
                character.resource_max,
                character.resource + stats.resource_regen,
            )
            gained = character.resource - before
            if gained > 0:
                parts.append(f"{character.resource_name}+{gained}")
        if parts:
            return f">> [回复] {' | '.join(parts)}"
        return ""

    def _player_turn(
        self,
        character: Character,
        monster: Monster,
        active_skills: list[SkillState],
    ) -> list[str]:
        logs: list[str] = []

        logs.append(self._cast_skill(character, monster, active_skills[0]))
        if monster.hp <= 0:
            return logs

        for state in active_skills[1:]:
            if not state.is_ready:
                continue
            if character.resource < state.resource_cost:
                continue
            logs.append(self._cast_skill(character, monster, state))
            if monster.hp <= 0:
                break

        return logs

    def _cast_skill(
        self,
        character: Character,
        monster: Monster,
        state: SkillState,
    ) -> str:
        tmpl = state.template
        is_basic = tmpl.id == "basic_attack"

        self._spend_resource(character, state)

        if tmpl.buff_damage > 0 or state.buff_damage > 0:
            character._buff_damage = state.buff_damage
            state.start_cooldown()
            pct = int(state.buff_damage * 100)
            return f">> [{tmpl.name}] 施放！后续伤害 +{pct}%"

        if state.heal_ratio > 0:
            heal = int(character.max_hp * state.heal_ratio)
            before = character.hp
            character.hp = min(character.max_hp, character.hp + heal)
            actual = character.hp - before
            state.start_cooldown()
            return f">> [{tmpl.name}] 恢复 {actual} 点生命"

        damage = self._calc_damage(character, state)
        if state.control_reduction > 0:
            monster.damage_reduction = state.control_reduction

        actual = monster.take_damage(damage)
        if state.effective.get("cooldown", tmpl.cooldown) > 0:
            state.start_cooldown()

        crit_text = "（暴击！）" if damage > self._base_damage(character, state) else ""
        prefix = ">> [普攻]" if is_basic else f">> [{tmpl.name}]"
        rank_text = "" if is_basic else f" Lv.{state.rank}"
        return f"{prefix}{rank_text}{crit_text} 造成 {actual} 点伤害"

    def _spend_resource(self, character: Character, state: SkillState) -> None:
        character.resource -= state.resource_cost
        if state.template.id == "basic_attack":
            character.resource = min(
                character.resource_max,
                character.resource + state.resource_gain,
            )
        character.resource = max(0, character.resource)

    def _base_damage(self, character: Character, state: SkillState) -> int:
        stats = character.total_stats()
        mult = state.damage_multiplier
        dmg = character.attack * mult
        if state.template.id != "basic_attack":
            dmg *= 1 + stats.skill_damage
        return int(dmg)

    def _calc_damage(self, character: Character, state: SkillState) -> int:
        stats = character.total_stats()
        mult = state.damage_multiplier
        dmg = character.attack * mult
        if state.template.id != "basic_attack":
            dmg *= 1 + stats.skill_damage
        dmg *= 1 + character._buff_damage

        if random.random() < stats.crit_rate:
            dmg *= 1 + stats.crit_damage

        variance = random.uniform(0.92, 1.08)
        return max(1, int(dmg * variance))

    def _monster_action(self, character: Character, monster: Monster) -> str:
        raw = int(monster.attack * random.uniform(0.88, 1.12))
        if monster.damage_reduction > 0:
            raw = int(raw * (1 - monster.damage_reduction))
            monster.damage_reduction = 0.0
        actual = max(1, raw - character.defense)
        character.hp -= actual
        return f"<< {monster.name} 攻击，造成 {actual} 点伤害"

    def _roll_forge_materials(self, monster: Monster) -> dict[str, int]:
        return roll_forge_material_drops(monster.floor, monster.is_boss, monster.is_elite)

    def _resolve_battle(
        self,
        character: Character,
        monster: Monster,
        log: list[str],
        battle_floor: int,
        advance_floor: bool,
    ) -> dict:
        result = {
            "victory": False,
            "log": log,
            "loot": None,
            "exp": 0,
            "gold": 0,
            "materials": {},
            "is_replay": not advance_floor,
            "battle_floor": battle_floor,
        }

        if character.hp <= 0:
            character.heal_full()
            if advance_floor:
                result["message"] = f"你在第 {battle_floor} 层战败，回城复活（层数不变）。"
            else:
                result["message"] = f"刷层失败（第 {battle_floor} 层），回城复活。"
            return result

        result["victory"] = True
        exp = int(25 * (1.18 ** battle_floor))
        if monster.is_elite:
            exp = int(exp * 1.5)
        if monster.is_boss:
            exp = int(exp * 2.5)
        if not advance_floor:
            exp = int(exp * self.FARM_EXP_RATIO)

        gold = int(10 + battle_floor * 3 * (1.1 if monster.is_boss else 1))
        if not advance_floor:
            gold = int(gold * self.FARM_EXP_RATIO)

        level_msgs = character.add_exp(exp)
        character.gold += gold
        mats = self._roll_forge_materials(monster)
        character.add_materials(mats)

        result["exp"] = exp
        result["gold"] = gold
        result["materials"] = mats
        result["level_msgs"] = level_msgs

        drop_chance = get_drop_chance(monster.is_boss, monster.is_elite)
        if random.random() < drop_chance:
            loot = generate_equipment(battle_floor)
            loot_result = add_loot_to_character(character, loot)
            result["loot"] = loot
            result["loot_action"] = loot_result["action"]
            if loot_result["action"] == "sold":
                result["loot_sold_gold"] = loot_result["gold"]
            elif loot_result["action"] == "dismantled":
                result["loot_dismantled"] = {
                    "tier": loot_result["tier"],
                    "qty": loot_result["qty"],
                }

        if advance_floor:
            character.highest_floor = max(character.highest_floor, battle_floor)
            if battle_floor >= MAX_FLOOR:
                character.floor = MAX_FLOOR + 1
                result["message"] = f"胜利！通关第 {MAX_FLOOR} 层，恭喜完成全部爬塔！"
            else:
                character.floor = battle_floor + 1
                result["message"] = f"胜利！通过第 {battle_floor} 层，解锁第 {character.floor} 层。"
        else:
            result["message"] = f"刷层胜利！第 {battle_floor} 层（重复挑战，进度不变）。"

        character.heal_full()
        return result


class ConsoleIO:
    def emit(self, text: str) -> None:
        print(text)
        time.sleep(BATTLE_ACTION_DELAY)

    def pause_turn(self) -> None:
        time.sleep(BATTLE_TURN_DELAY)

    def print_hp_bars(self, character: Character, monster: Monster) -> None:
        from ui.progress_bar import format_combat_hp

        print(format_combat_hp("我方", character.hp, character.max_hp))
        print(format_combat_hp("敌方", monster.hp, monster.max_hp))
        time.sleep(0.15)

    def print_battle_start(
        self,
        character: Character,
        monster: Monster,
        battle_floor: int,
        is_replay: bool,
    ) -> None:
        from config.constants import get_available_rarities

        tag = f"[{monster.tag}]" if monster.tag != "普通" else ""
        mode = "回顾刷层" if is_replay else "推进爬塔"
        rarities = " / ".join(get_available_rarities(battle_floor))
        learned = sum(
            1 for t in character.get_active_skills()
            if t.template.id != "basic_attack"
        )
        print(f"\n{'=' * 40}")
        print(f"  [{mode}] 第 {battle_floor} 层")
        print(f"  遭遇 {tag}{monster.name}")
        print(f"  敌人 HP:{monster.max_hp} ATK:{monster.attack} DEF:{monster.defense}")
        print(f"  可掉落品质: {rarities}")
        print(f"  已学主动技能: {learned} 个 | 技能点: {character.skill_points}")
        print(f"{'=' * 40}")
        self.print_hp_bars(character, monster)
        time.sleep(0.4)

    def print_turn_header(
        self,
        character: Character,
        monster: Monster,
        turn: int,
        active_skills: list[SkillState],
    ) -> None:
        from ui.progress_bar import format_combat_hp

        print(f"\n--- 回合 {turn} ---")
        print(format_combat_hp("我方", character.hp, character.max_hp))
        print(
            f"  {character.resource_name}: {character.resource}/{character.resource_max}"
        )
        print(format_combat_hp(f"敌方", monster.hp, monster.max_hp))
        cd_parts = []
        for state in active_skills[1:]:
            tmpl = state.template
            if state.is_ready:
                if character.resource >= state.resource_cost:
                    cd_parts.append(f"{tmpl.name} Lv.{state.rank}:就绪")
                else:
                    cd_parts.append(f"{tmpl.name}:缺{character.resource_name}")
            else:
                cd_parts.append(f"{tmpl.name}:CD{state.current_cd}")
        if cd_parts:
            print("技能: " + " | ".join(cd_parts))
        time.sleep(0.25)
