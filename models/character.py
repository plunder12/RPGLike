"""玩家角色。"""

from dataclasses import dataclass, field

from config.classes import get_class_config
from config.constants import BASE_EXP, EQUIPMENT_SLOTS, EXP_GROWTH
from config.forge import FORGE_PERCENT_PER_LEVEL, FORGE_SLOT_CONFIG, empty_material_bag, format_material_bag
from config.skills import (
    SKILL_POINT_PER_LEVEL,
    get_class_skill_tree,
    get_skill,
    resolve_passive_bonus,
)
from models.equipment import Equipment
from models.skill import SkillState
from models.stats import StatBlock


@dataclass
class Character:
    name: str
    class_id: str
    level: int = 1
    exp: int = 0
    hp: int = 100
    resource: int = 0
    floor: int = 1
    highest_floor: int = 0
    gold: int = 0
    skill_points: int = 0
    skill_ranks: dict[str, int] = field(default_factory=dict)
    forge_levels: dict[str, int] = field(default_factory=dict)
    forge_materials: dict[str, int] = field(default_factory=dict)
    bonus_hp: int = 0
    bonus_attack: int = 0
    bonus_defense: int = 0
    bonus_resource: int = 0
    equipment: dict[str, Equipment | None] = field(default_factory=dict)
    inventory: list[Equipment] = field(default_factory=list)
    _buff_damage: float = 0.0

    def __post_init__(self):
        if not self.equipment:
            self.equipment = {slot: None for slot in EQUIPMENT_SLOTS}
        if not self.forge_levels:
            self.forge_levels = {slot: 0 for slot in EQUIPMENT_SLOTS}
        if not self.forge_materials:
            self.forge_materials = empty_material_bag()
        if "basic_attack" not in self.skill_ranks:
            self.skill_ranks["basic_attack"] = 1

    @property
    def class_config(self) -> dict:
        return get_class_config(self.class_id)

    @property
    def class_name(self) -> str:
        return self.class_config["name"]

    @property
    def resource_name(self) -> str:
        return self.class_config["resource_name"]

    @property
    def resource_max(self) -> int:
        return self.class_config["resource_max"] + self.bonus_resource

    def exp_to_next(self) -> int:
        return int(BASE_EXP * (EXP_GROWTH ** (self.level - 1)))

    def get_skill_rank(self, skill_id: str) -> int:
        return self.skill_ranks.get(skill_id, 0)

    def get_active_skills(self) -> list[SkillState]:
        """战斗中可用的主动技能（普攻 + 已学主动）。"""
        skills: list[SkillState] = []
        basic = get_skill("basic_attack")
        skills.append(SkillState(basic, rank=self.get_skill_rank("basic_attack")))

        for tmpl in get_class_skill_tree(self.class_id):
            if tmpl.skill_type != "active":
                continue
            rank = self.get_skill_rank(tmpl.id)
            if rank > 0:
                skills.append(SkillState(tmpl, rank=rank))
        return skills

    def _passive_bonus_dict(self) -> dict:
        bonus = {
            "max_hp": 0, "attack": 0, "defense": 0,
            "crit_rate": 0.0, "crit_damage": 0.0, "skill_damage": 0.0,
            "hp_regen": 0, "resource_regen": 0,
        }
        for tmpl in get_class_skill_tree(self.class_id):
            if tmpl.skill_type != "passive":
                continue
            rank = self.get_skill_rank(tmpl.id)
            if rank <= 0:
                continue
            pb = resolve_passive_bonus(tmpl, rank)
            for k, v in pb.items():
                if k in bonus:
                    bonus[k] += v
        return bonus

    def _forge_fixed_total(self) -> dict:
        total = {
            "max_hp": 0, "attack": 0, "defense": 0,
            "crit_rate": 0.0, "crit_damage": 0.0, "skill_damage": 0.0,
            "hp_regen": 0, "resource_regen": 0,
        }
        for slot, lv in self.forge_levels.items():
            if lv <= 0:
                continue
            fixed = FORGE_SLOT_CONFIG.get(slot, {}).get("fixed_per_level", {})
            for k, v in fixed.items():
                if k in total:
                    total[k] += v * lv
        return total

    def total_stats(self) -> StatBlock:
        base = StatBlock(**self.class_config["base_stats"])
        base = base.scale_level(self.level, self.class_config["growth"])
        base.max_hp += self.bonus_hp
        base.attack += self.bonus_attack
        base.defense += self.bonus_defense

        equip_bonus = StatBlock()
        for slot, item in self.equipment.items():
            if not item:
                continue
            flv = self.forge_levels.get(slot, 0)
            bonus = item.stat_bonus(forge_level=flv, forge_percent=FORGE_PERCENT_PER_LEVEL)
            equip_bonus.max_hp += int(bonus["max_hp"])
            equip_bonus.attack += int(bonus["attack"])
            equip_bonus.defense += int(bonus["defense"])
            equip_bonus.crit_rate += bonus["crit_rate"]
            equip_bonus.crit_damage += bonus["crit_damage"]
            equip_bonus.skill_damage += bonus["skill_damage"]
            equip_bonus.hp_regen += int(bonus["hp_regen"])
            equip_bonus.resource_regen += int(bonus["resource_regen"])

        passive = self._passive_bonus_dict()
        pass_block = StatBlock(
            max_hp=int(passive["max_hp"]),
            attack=int(passive["attack"]),
            defense=int(passive["defense"]),
            crit_rate=passive["crit_rate"],
            crit_damage=passive["crit_damage"],
            skill_damage=passive["skill_damage"],
            hp_regen=int(passive["hp_regen"]),
            resource_regen=int(passive["resource_regen"]),
        )

        forge_block = StatBlock(
            max_hp=int(self._forge_fixed_total()["max_hp"]),
            attack=int(self._forge_fixed_total()["attack"]),
            defense=int(self._forge_fixed_total()["defense"]),
        )

        return base.add(equip_bonus).add(pass_block).add(forge_block)

    @property
    def max_hp(self) -> int:
        return self.total_stats().max_hp

    @property
    def attack(self) -> int:
        return self.total_stats().attack

    @property
    def defense(self) -> int:
        return self.total_stats().defense

    def heal_full(self) -> None:
        self.hp = self.max_hp
        self.resource = min(self.resource_max, self.resource + 20)

    def learn_skill(self, skill_id: str) -> tuple[bool, str]:
        if skill_id == "basic_attack":
            return False, "普通攻击无需学习"
        tmpl = get_skill(skill_id)
        if tmpl.class_id != self.class_id:
            return False, "该技能不属于当前职业"
        rank = self.get_skill_rank(skill_id)
        if rank >= tmpl.max_rank:
            return False, f"{tmpl.name} 已满级 ({tmpl.max_rank}/{tmpl.max_rank})"
        if self.skill_points < 1:
            return False, "技能点不足"
        self.skill_points -= 1
        self.skill_ranks[skill_id] = rank + 1
        return True, f"{tmpl.name} 提升至 Lv.{rank + 1}/{tmpl.max_rank}"

    def unlearn_skill(self, skill_id: str) -> tuple[bool, str]:
        if skill_id == "basic_attack":
            return False, "普通攻击无法回退"
        tmpl = get_skill(skill_id)
        if tmpl.class_id != self.class_id:
            return False, "该技能不属于当前职业"
        rank = self.get_skill_rank(skill_id)
        if rank <= 0:
            return False, f"{tmpl.name} 尚未学习"
        self.skill_ranks[skill_id] = rank - 1
        if self.skill_ranks[skill_id] <= 0:
            del self.skill_ranks[skill_id]
        self.skill_points += 1
        new_rank = self.get_skill_rank(skill_id)
        status = f"Lv.{new_rank}/{tmpl.max_rank}" if new_rank else "未学习"
        return True, f"{tmpl.name} 回退至 {status}，返还 1 技能点"

    def reset_all_skills(self) -> tuple[bool, str]:
        refunded = 0
        for skill_id, rank in list(self.skill_ranks.items()):
            if skill_id == "basic_attack":
                continue
            tmpl = get_skill(skill_id)
            if tmpl.class_id == self.class_id:
                refunded += rank
        if refunded == 0:
            return False, "没有可重置的已学技能"
        self.skill_ranks = {"basic_attack": 1}
        self.skill_points += refunded
        return True, f"已重置全部技能，返还 {refunded} 技能点（普通攻击保留）"

    def add_materials(self, drops: dict[str, int]) -> None:
        for tier, qty in drops.items():
            if qty > 0:
                self.forge_materials[tier] = self.forge_materials.get(tier, 0) + qty

    @property
    def materials_summary(self) -> str:
        return format_material_bag(self.forge_materials)

    def _apply_level_up_bonus(self) -> str:
        bonus = self.class_config.get("level_up_bonus", {})
        hp = bonus.get("max_hp", 0)
        atk = bonus.get("attack", 0)
        df = bonus.get("defense", 0)
        res = bonus.get("resource_max", 0)
        self.bonus_hp += hp
        self.bonus_attack += atk
        self.bonus_defense += df
        self.bonus_resource += res
        self.skill_points += SKILL_POINT_PER_LEVEL
        parts = []
        if hp:
            parts.append(f"生命+{hp}")
        if atk:
            parts.append(f"攻击+{atk}")
        if df:
            parts.append(f"防御+{df}")
        if res:
            parts.append(f"{self.resource_name}上限+{res}")
        parts.append(f"技能点+{SKILL_POINT_PER_LEVEL}")
        return "，".join(parts)

    def add_exp(self, amount: int) -> list[str]:
        self.exp += amount
        messages = []
        while self.exp >= self.exp_to_next():
            self.exp -= self.exp_to_next()
            self.level += 1
            detail = self._apply_level_up_bonus()
            self.hp = self.max_hp
            res_bonus = self.class_config.get("level_up_bonus", {}).get("resource_max", 0)
            if res_bonus:
                self.resource = min(self.resource_max, self.resource + res_bonus)
            messages.append(f"升级！Lv.{self.level} ({detail})")
        return messages

    def equip_item(self, item: Equipment) -> Equipment | None:
        old = self.equipment.get(item.slot)
        self.equipment[item.slot] = item
        self.hp = min(self.hp, self.max_hp)
        return old

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "class_id": self.class_id,
            "level": self.level,
            "exp": self.exp,
            "hp": self.hp,
            "resource": self.resource,
            "floor": self.floor,
            "highest_floor": self.highest_floor,
            "gold": self.gold,
            "skill_points": self.skill_points,
            "skill_ranks": dict(self.skill_ranks),
            "forge_levels": dict(self.forge_levels),
            "forge_materials": dict(self.forge_materials),
            "bonus_hp": self.bonus_hp,
            "bonus_attack": self.bonus_attack,
            "bonus_defense": self.bonus_defense,
            "bonus_resource": self.bonus_resource,
            "equipment": {k: (v.to_dict() if v else None) for k, v in self.equipment.items()},
            "inventory": [i.to_dict() for i in self.inventory],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Character":
        char = cls(
            name=data["name"],
            class_id=data["class_id"],
            level=data["level"],
            exp=data["exp"],
            hp=data["hp"],
            resource=data.get("resource", 0),
            floor=data["floor"],
            highest_floor=data.get("highest_floor", data["floor"]),
            gold=data.get("gold", 0),
            skill_points=data.get("skill_points", 0),
            skill_ranks=data.get("skill_ranks", {}),
            forge_levels=data.get("forge_levels", {}),
            forge_materials=data.get("forge_materials", {}),
            bonus_hp=data.get("bonus_hp", 0),
            bonus_attack=data.get("bonus_attack", 0),
            bonus_defense=data.get("bonus_defense", 0),
            bonus_resource=data.get("bonus_resource", 0),
        )
        char.equipment = {
            k: (Equipment.from_dict(v) if v else None)
            for k, v in data["equipment"].items()
        }
        char.inventory = [Equipment.from_dict(i) for i in data["inventory"]]
        if "skill_ranks" not in data:
            char.skill_ranks = {"basic_attack": 1}
            char.skill_points = max(0, char.level - 1)
        if "forge_levels" not in data:
            char.forge_levels = {slot: 0 for slot in EQUIPMENT_SLOTS}
        if "forge_materials" not in data:
            char.forge_materials = empty_material_bag()
        elif isinstance(data.get("forge_materials"), int):
            # 旧存档：整数材料全部转为普通
            old = data["forge_materials"]
            char.forge_materials = empty_material_bag()
            char.forge_materials["普通"] = old
        if not char.forge_materials:
            char.forge_materials = empty_material_bag()
        if "basic_attack" not in char.skill_ranks:
            char.skill_ranks["basic_attack"] = 1
        if not char.forge_levels:
            char.forge_levels = {slot: 0 for slot in EQUIPMENT_SLOTS}
        if "skill_ranks" not in data:
            pass  # 已在上方处理旧存档
        elif char.skill_points == 0 and char.level > 1 and len(char.skill_ranks) <= 1:
            char.skill_points = max(0, char.level - 1)
        return char

    @classmethod
    def create(cls, name: str, class_id: str) -> "Character":
        cfg = get_class_config(class_id)
        stats = StatBlock(**cfg["base_stats"])
        char = cls(
            name=name,
            class_id=class_id,
            hp=stats.max_hp,
            resource=0,
            skill_ranks={"basic_attack": 1},
            forge_materials=empty_material_bag(),
        )
        return char
