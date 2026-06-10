"""角色属性计算。"""

from dataclasses import dataclass
from copy import deepcopy


@dataclass
class StatBlock:
    max_hp: int = 100
    attack: int = 10
    defense: int = 0
    crit_rate: float = 0.05
    crit_damage: float = 0.5
    skill_damage: float = 0.0
    hp_regen: int = 0
    resource_regen: int = 0
    move_speed: int = 0          # 固定移速（像素/秒）
    move_speed_pct: float = 0.0  # 百分比移速加成

    def copy(self) -> "StatBlock":
        return deepcopy(self)

    def add(self, other: "StatBlock") -> "StatBlock":
        return StatBlock(
            max_hp=self.max_hp + other.max_hp,
            attack=self.attack + other.attack,
            defense=self.defense + other.defense,
            crit_rate=self.crit_rate + other.crit_rate,
            crit_damage=self.crit_damage + other.crit_damage,
            skill_damage=self.skill_damage + other.skill_damage,
            hp_regen=self.hp_regen + other.hp_regen,
            resource_regen=self.resource_regen + other.resource_regen,
            move_speed=self.move_speed + other.move_speed,
            move_speed_pct=self.move_speed_pct + other.move_speed_pct,
        )

    @property
    def effective_move_speed(self) -> int:
        return int(self.move_speed * (1 + self.move_speed_pct))

    def scale_level(self, level: int, growth: dict) -> "StatBlock":
        if level <= 1:
            return self.copy()
        result = self.copy()
        for _lv in range(2, level + 1):
            result.max_hp += growth.get("max_hp", 0)
            result.attack += growth.get("attack", 0)
            result.defense += growth.get("defense", 0)
        return result
