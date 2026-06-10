"""技能注册表 — 技能点学习，每技能最多3级，含被动。"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SkillTemplate:
    id: str
    name: str
    desc: str
    class_id: str  # "common" 表示通用
    skill_type: str  # active | passive
    max_rank: int = 3
    cooldown: int = 0
    resource_cost: int = 0
    resource_gain: int = 0
    damage_multiplier: float = 0.0
    heal_ratio: float = 0.0  # 主动治疗占 max_hp 比例
    buff_damage: float = 0.0  # 战吼类
    control_reduction: float = 0.0  # 冰霜新星类
    tags: tuple = ()
    # 每级被动加成 {stat_key: 每级数值}
    passive_per_rank: dict = field(default_factory=dict)
    # 每升1级对主动技能的增量
    rank_bonus: dict = field(default_factory=dict)


SKILL_REGISTRY: dict[str, SkillTemplate] = {
    "basic_attack": SkillTemplate(
        id="basic_attack",
        name="普通攻击",
        desc="基础攻击，每回合自动释放。",
        class_id="common",
        skill_type="active",
        max_rank=1,
        cooldown=0,
        resource_cost=0,
        resource_gain=10,
        damage_multiplier=1.0,
    ),
    # ── 野蛮人 ──
    "whirlwind": SkillTemplate(
        id="whirlwind",
        name="旋风斩",
        desc="旋转斩击，范围伤害。",
        class_id="barbarian",
        skill_type="active",
        cooldown=2,
        resource_cost=18,
        damage_multiplier=1.5,
        tags=("aoe",),
        rank_bonus={"damage_multiplier": 0.25, "resource_cost": -2},
    ),
    "war_cry": SkillTemplate(
        id="war_cry",
        name="战吼",
        desc="鼓舞自身，提升后续伤害。",
        class_id="barbarian",
        skill_type="active",
        cooldown=3,
        resource_cost=12,
        buff_damage=0.25,
        tags=("buff",),
        rank_bonus={"buff_damage": 0.08},
    ),
    "ground_slam": SkillTemplate(
        id="ground_slam",
        name="大地猛击",
        desc="重击地面，巨额单体伤害。",
        class_id="barbarian",
        skill_type="active",
        cooldown=4,
        resource_cost=28,
        damage_multiplier=2.2,
        rank_bonus={"damage_multiplier": 0.35, "cooldown": -1},
    ),
    "bloodthirst": SkillTemplate(
        id="bloodthirst",
        name="嗜血",
        desc="被动：每回合恢复生命。",
        class_id="barbarian",
        skill_type="passive",
        passive_per_rank={"hp_regen": 4},
    ),
    "iron_skin": SkillTemplate(
        id="iron_skin",
        name="铁皮",
        desc="被动：提升防御。",
        class_id="barbarian",
        skill_type="passive",
        passive_per_rank={"defense": 5},
    ),
    "rampage": SkillTemplate(
        id="rampage",
        name="狂暴",
        desc="被动：提升技能伤害。",
        class_id="barbarian",
        skill_type="passive",
        passive_per_rank={"skill_damage": 0.06},
    ),
    # ── 法师 ──
    "fireball": SkillTemplate(
        id="fireball",
        name="火球术",
        desc="发射火球造成法术伤害。",
        class_id="wizard",
        skill_type="active",
        cooldown=1,
        resource_cost=14,
        damage_multiplier=1.7,
        tags=("spell",),
        rank_bonus={"damage_multiplier": 0.22},
    ),
    "frost_nova": SkillTemplate(
        id="frost_nova",
        name="冰霜新星",
        desc="冰霜爆发，伤害并削弱敌人。",
        class_id="wizard",
        skill_type="active",
        cooldown=3,
        resource_cost=22,
        damage_multiplier=1.1,
        control_reduction=0.20,
        tags=("spell", "control"),
        rank_bonus={"damage_multiplier": 0.18, "control_reduction": 0.05},
    ),
    "arcane_blast": SkillTemplate(
        id="arcane_blast",
        name="奥术冲击",
        desc="凝聚奥术能量重击。",
        class_id="wizard",
        skill_type="active",
        cooldown=4,
        resource_cost=32,
        damage_multiplier=2.4,
        tags=("spell",),
        rank_bonus={"damage_multiplier": 0.40, "cooldown": -1},
    ),
    "mana_flow": SkillTemplate(
        id="mana_flow",
        name="法力涌动",
        desc="被动：每回合恢复法力。",
        class_id="wizard",
        skill_type="passive",
        passive_per_rank={"resource_regen": 6},
    ),
    "arcane_power": SkillTemplate(
        id="arcane_power",
        name="奥术强化",
        desc="被动：提升技能伤害。",
        class_id="wizard",
        skill_type="passive",
        passive_per_rank={"skill_damage": 0.08},
    ),
    "spell_weave": SkillTemplate(
        id="spell_weave",
        name="咒文编织",
        desc="被动：提升暴击率。",
        class_id="wizard",
        skill_type="passive",
        passive_per_rank={"crit_rate": 0.025},
    ),
    # ── 武僧 ──
    "fist_of_thunder": SkillTemplate(
        id="fist_of_thunder",
        name="雷光拳",
        desc="迅捷连击。",
        class_id="monk",
        skill_type="active",
        cooldown=1,
        resource_cost=10,
        damage_multiplier=1.4,
        rank_bonus={"damage_multiplier": 0.20},
    ),
    "healing_light": SkillTemplate(
        id="healing_light",
        name="治愈之光",
        desc="恢复生命值。",
        class_id="monk",
        skill_type="active",
        cooldown=3,
        resource_cost=18,
        heal_ratio=0.22,
        tags=("heal",),
        rank_bonus={"heal_ratio": 0.06, "cooldown": -1},
    ),
    "seven_sided_strike": SkillTemplate(
        id="seven_sided_strike",
        name="七相拳",
        desc="连续七次打击。",
        class_id="monk",
        skill_type="active",
        cooldown=4,
        resource_cost=28,
        damage_multiplier=2.0,
        rank_bonus={"damage_multiplier": 0.30},
    ),
    "inner_peace": SkillTemplate(
        id="inner_peace",
        name="内息回春",
        desc="被动：每回合恢复生命。",
        class_id="monk",
        skill_type="passive",
        passive_per_rank={"hp_regen": 5},
    ),
    "chi_reserve": SkillTemplate(
        id="chi_reserve",
        name="气海蓄力",
        desc="被动：每回合恢复真气。",
        class_id="monk",
        skill_type="passive",
        passive_per_rank={"resource_regen": 5},
    ),
    "deadly_touch": SkillTemplate(
        id="deadly_touch",
        name="致命之触",
        desc="被动：提升暴击伤害。",
        class_id="monk",
        skill_type="passive",
        passive_per_rank={"crit_damage": 0.10},
    ),
}

CLASS_SKILL_TREES: dict[str, list[str]] = {
    "barbarian": [
        "whirlwind", "war_cry", "ground_slam",
        "bloodthirst", "iron_skin", "rampage",
    ],
    "wizard": [
        "fireball", "frost_nova", "arcane_blast",
        "mana_flow", "arcane_power", "spell_weave",
    ],
    "monk": [
        "fist_of_thunder", "healing_light", "seven_sided_strike",
        "inner_peace", "chi_reserve", "deadly_touch",
    ],
}

SKILL_POINT_PER_LEVEL = 1


def get_skill(skill_id: str) -> SkillTemplate:
    if skill_id not in SKILL_REGISTRY:
        raise ValueError(f"未知技能: {skill_id}")
    return SKILL_REGISTRY[skill_id]


def get_class_skill_tree(class_id: str) -> list[SkillTemplate]:
    ids = CLASS_SKILL_TREES.get(class_id, [])
    return [get_skill(sid) for sid in ids]


def resolve_active_skill(template: SkillTemplate, rank: int) -> dict:
    """根据技能等级计算有效数值。"""
    if rank <= 0:
        return {}
    r = {
        "cooldown": max(0, template.cooldown),
        "resource_cost": template.resource_cost,
        "resource_gain": template.resource_gain,
        "damage_multiplier": template.damage_multiplier,
        "heal_ratio": template.heal_ratio,
        "buff_damage": template.buff_damage,
        "control_reduction": template.control_reduction,
    }
    for key, per_rank in template.rank_bonus.items():
        if key == "cooldown":
            r[key] = max(0, r.get(key, 0) + per_rank * (rank - 1))
        elif key == "resource_cost":
            r[key] = max(0, r.get(key, 0) + per_rank * (rank - 1))
        else:
            r[key] = r.get(key, 0) + per_rank * (rank - 1)
    return r


def resolve_passive_bonus(template: SkillTemplate, rank: int) -> dict:
    bonus: dict = {}
    if rank <= 0:
        return bonus
    for stat, per_rank in template.passive_per_rank.items():
        bonus[stat] = per_rank * rank
    return bonus
