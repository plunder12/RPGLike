"""职业配置 — 新增职业只需在此注册。"""

CLASS_REGISTRY = {
    "barbarian": {
        "id": "barbarian",
        "name": "野蛮人",
        "desc": "近战高血高攻，擅长爆发与生存。",
        "resource": "fury",
        "resource_name": "怒气",
        "resource_max": 100,
        "base_stats": {
            "max_hp": 120,
            "attack": 18,
            "defense": 6,
            "crit_rate": 0.05,
            "crit_damage": 0.5,
        },
        "growth": {"max_hp": 14, "attack": 3, "defense": 1},
        "level_up_bonus": {"max_hp": 8, "attack": 2, "defense": 1, "resource_max": 4},
    },
    "wizard": {
        "id": "wizard",
        "name": "法师",
        "desc": "远程法术输出，高暴击与技能伤害。",
        "resource": "mana",
        "resource_name": "法力",
        "resource_max": 120,
        "base_stats": {
            "max_hp": 80,
            "attack": 14,
            "defense": 3,
            "crit_rate": 0.12,
            "crit_damage": 0.75,
        },
        "growth": {"max_hp": 8, "attack": 4, "defense": 0},
        "level_up_bonus": {"max_hp": 5, "attack": 2, "defense": 0, "resource_max": 6},
    },
    "monk": {
        "id": "monk",
        "name": "武僧",
        "desc": "均衡型，可攻可守，擅长连击与回复。",
        "resource": "spirit",
        "resource_name": "真气",
        "resource_max": 100,
        "base_stats": {
            "max_hp": 100,
            "attack": 15,
            "defense": 5,
            "crit_rate": 0.08,
            "crit_damage": 0.55,
        },
        "growth": {"max_hp": 10, "attack": 3, "defense": 1},
        "level_up_bonus": {"max_hp": 6, "attack": 2, "defense": 1, "resource_max": 5},
    },
}


def get_class_config(class_id: str) -> dict:
    if class_id not in CLASS_REGISTRY:
        raise ValueError(f"未知职业: {class_id}")
    return CLASS_REGISTRY[class_id]


def list_classes() -> list[dict]:
    return list(CLASS_REGISTRY.values())
