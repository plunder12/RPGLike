"""战斗 IO — 收集事件供 Web/回放使用。"""

from config.constants import get_available_rarities
from models.character import Character
from models.monster import Monster
from models.skill import SkillState


class CollectingBattleIO:
    """无 sleep，将战斗过程写入 timeline。"""

    def __init__(self) -> None:
        self.timeline: list[dict] = []

    def emit(self, text: str) -> None:
        self.timeline.append({"type": "action", "text": text})

    def pause_turn(self) -> None:
        self.timeline.append({"type": "turn_end"})

    def _hp_snapshot(self, character: Character, monster: Monster) -> dict:
        return {
            "type": "hp",
            "player": {
                "hp": character.hp,
                "max_hp": character.max_hp,
                "resource": character.resource,
                "resource_max": character.resource_max,
                "resource_name": character.resource_name,
            },
            "enemy": {
                "name": monster.name,
                "hp": monster.hp,
                "max_hp": monster.max_hp,
                "tag": monster.tag,
            },
        }

    def print_hp_bars(self, character: Character, monster: Monster) -> None:
        self.timeline.append(self._hp_snapshot(character, monster))

    def print_battle_start(
        self,
        character: Character,
        monster: Monster,
        battle_floor: int,
        is_replay: bool,
    ) -> None:
        tag = monster.tag if monster.tag != "普通" else ""
        self.timeline.append({
            "type": "start",
            "floor": battle_floor,
            "mode": "farm" if is_replay else "push",
            "monster": {
                "name": monster.name,
                "tag": tag,
                "max_hp": monster.max_hp,
                "attack": monster.attack,
                "defense": monster.defense,
            },
            "rarities": get_available_rarities(battle_floor),
        })
        self.print_hp_bars(character, monster)

    def print_turn_header(
        self,
        character: Character,
        monster: Monster,
        turn: int,
        active_skills: list[SkillState],
    ) -> None:
        skills = []
        for state in active_skills[1:]:
            tmpl = state.template
            if state.is_ready:
                status = "ready" if character.resource >= state.resource_cost else "no_resource"
            else:
                status = f"cd_{state.current_cd}"
            skills.append({"name": tmpl.name, "rank": state.rank, "status": status})
        self.timeline.append({
            "type": "turn",
            "turn": turn,
            "skills": skills,
            **self._hp_snapshot(character, monster),
        })
