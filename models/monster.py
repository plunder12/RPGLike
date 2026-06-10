"""怪物生成。"""

import random
from dataclasses import dataclass

from config.constants import (
    BOSS_ATK_MULT,
    BOSS_FLOOR_INTERVAL,
    BOSS_HP_MULT,
    ELITE_ATK_MULT,
    ELITE_HP_MULT,
    FLOOR_ATK_BASE,
    FLOOR_ATK_GROWTH,
    FLOOR_HP_BASE,
    FLOOR_HP_GROWTH,
)

MONSTER_NAMES = [
    "腐化骷髅", "暗影猎犬", "深渊魔", "石像鬼", "邪教徒",
    "怨灵", "熔岩元素", "冰霜女巫", "堕落骑士", "噬魂者",
]
ELITE_PREFIX = ["精英·", "强化·", "凶暴·"]
BOSS_NAMES = ["塔之守卫", "深渊领主", "古塔意志", "灭世者", "不朽君王"]


@dataclass
class Monster:
    name: str
    floor: int
    max_hp: int
    hp: int
    attack: int
    defense: int
    is_elite: bool = False
    is_boss: bool = False
    damage_reduction: float = 0.0  # 被控制时减伤

    @property
    def tag(self) -> str:
        if self.is_boss:
            return "BOSS"
        if self.is_elite:
            return "精英"
        return "普通"

    def take_damage(self, amount: int) -> int:
        actual = max(1, amount - self.defense)
        self.hp = max(0, self.hp - actual)
        return actual


def generate_monster(floor: int) -> Monster:
    is_boss = floor % BOSS_FLOOR_INTERVAL == 0
    is_elite = not is_boss and random.random() < 0.18

    hp = int(FLOOR_HP_BASE * (FLOOR_HP_GROWTH ** floor))
    atk = int(FLOOR_ATK_BASE * (FLOOR_ATK_GROWTH ** floor))
    defense = max(0, floor // 5)

    if is_elite:
        hp = int(hp * ELITE_HP_MULT)
        atk = int(atk * ELITE_ATK_MULT)
    if is_boss:
        hp = int(hp * BOSS_HP_MULT)
        atk = int(atk * BOSS_ATK_MULT)
        defense += floor // 3

    if is_boss:
        name = f"第{floor}层·{random.choice(BOSS_NAMES)}"
    elif is_elite:
        name = f"{random.choice(ELITE_PREFIX)}{random.choice(MONSTER_NAMES)}"
    else:
        name = random.choice(MONSTER_NAMES)

    return Monster(
        name=name,
        floor=floor,
        max_hp=hp,
        hp=hp,
        attack=atk,
        defense=defense,
        is_elite=is_elite,
        is_boss=is_boss,
    )
