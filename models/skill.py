"""技能运行时状态。"""

from dataclasses import dataclass, field

from config.skills import SkillTemplate, get_skill, resolve_active_skill


@dataclass
class SkillState:
    template: SkillTemplate
    rank: int = 1
    current_cd: int = 0
    effective: dict = field(default_factory=dict)

    def __post_init__(self):
        self.refresh_effective()

    def refresh_effective(self) -> None:
        if self.template.skill_type == "active":
            self.effective = resolve_active_skill(self.template, self.rank)
        else:
            self.effective = {}

    @property
    def skill_id(self) -> str:
        return self.template.id

    @property
    def is_ready(self) -> bool:
        return self.current_cd <= 0

    def tick_cooldowns(self) -> None:
        if self.current_cd > 0:
            self.current_cd -= 1

    def start_cooldown(self) -> None:
        cd = self.effective.get("cooldown", self.template.cooldown)
        self.current_cd = cd

    def reset(self) -> None:
        self.current_cd = 0

    @property
    def resource_cost(self) -> int:
        return self.effective.get("resource_cost", self.template.resource_cost)

    @property
    def resource_gain(self) -> int:
        return self.effective.get("resource_gain", self.template.resource_gain)

    @property
    def damage_multiplier(self) -> float:
        return self.effective.get("damage_multiplier", self.template.damage_multiplier)

    @property
    def heal_ratio(self) -> float:
        return self.effective.get("heal_ratio", self.template.heal_ratio)

    @property
    def buff_damage(self) -> float:
        return self.effective.get("buff_damage", self.template.buff_damage)

    @property
    def control_reduction(self) -> float:
        return self.effective.get("control_reduction", self.template.control_reduction)
