# 文字暗黑 · 无限爬塔

类暗黑风格的文字 RPG，支持 **命令行（CLI）** 与 **Web** 两种玩法。核心逻辑共用同一套 Python 代码与 JSON 存档，可在终端与浏览器之间无缝切换。

当前版本：**v0.3**

---

## 特性概览

- **三座职业**：野蛮人、法师、武僧，各有独立技能树与资源（怒气 / 法力 / 真气）
- **无限爬塔**：最高 50 层，每 10 层 BOSS，随机精英怪
- **自动回合战斗**：每回合自动普攻 + 释放所有 CD 就绪且资源足够的技能
- **技能系统**：升级获得技能点，每技能最多 3 级；支持主动 / 被动、遗忘、全部重置
- **装备系统**：6 部位、4 品质（普通 / 魔法 / 稀有 / 传奇），词缀按部位约束
- **背包管理**：装备对比、售卖、分解、丢弃，支持一键售卖 / 一键分解
- **部位锻造**：按槽位强化（与具体装备无关），每级 +10% 该部位词缀 + 固定属性
- **刷层模式**：回顾已通关层数 farming，经验与金币为正常的 50%
- **存档**：`saves/` 目录 JSON 存储，CLI 与 Web 共享

---

## 环境要求

- Python 3.10+
- CLI 版无第三方依赖（标准库即可）
- Web 版额外需要：`fastapi`、`uvicorn`、`pydantic`（见 `requirements-web.txt`）

---

## 快速开始

### 命令行版

```bash
cd RPGlike
python main.py
```

### Web 版

```bash
cd RPGlike
pip install -r requirements-web.txt
python main_web.py
```

浏览器访问：**http://127.0.0.1:8765**

> CLI 与 Web 读写同一 `saves/` 目录，角色数据互通。

---

## 游戏玩法

### 创建角色

初始仅拥有 **普通攻击**，升级后获得技能点，在技能菜单中学习职业专属技能。

### 爬塔

| 模式 | 说明 |
|------|------|
| 推进爬塔 | 挑战当前最高层，胜利后解锁下一层 |
| 回顾刷层 | 重复挑战已通关层，收益 50%，用于刷装备与材料 |

### 战斗规则

- 我方每回合：普攻 → 按顺序尝试所有就绪技能
- 技能独立 CD；仅普攻恢复资源
- 怪物回合：单次攻击，部分控制技能可减伤
- 胜利掉落：经验、金币、锻造材料、装备（按层数解锁更高品质）

### 装备品质与层数

| 层数 | 可掉落品质 |
|------|-----------|
| 1–10 | 普通 |
| 11–20 | 普通、魔法 |
| 21–30 | 普通、魔法、稀有 |
| 31+  | 全部（含传奇） |

### 锻造

- 6 个部位各自独立锻造等级，最高 **Lv.50**
- 消耗金币 + 分级材料（普通 / 稀有 / 史诗 / 传说）
- 材料来源：战斗掉落、装备分解
- 分解映射：普通→普通、魔法→稀有、稀有→史诗、传奇→传说

### CLI 主菜单

```
1. 挑战爬塔      2. 角色状态
3. 背包与装备    4. 技能学习
5. 装备锻造      6. 保存并返回
0. 保存并退出
```

---

## 项目结构

```
RPGlike/
├── main.py                 # CLI 入口
├── main_web.py             # Web 入口（uvicorn :8765）
├── requirements-web.txt
│
├── config/                 # 静态配置
│   ├── classes.py          # 职业
│   ├── skills.py           # 技能注册表与技能树
│   ├── forge.py            # 锻造消耗与部位加成
│   └── constants.py        # 词缀、层数、掉落、常量
│
├── models/                 # 数据模型
│   ├── character.py        # 角色（技能点、锻造、背包）
│   ├── equipment.py        # 装备生成与词缀
│   ├── skill.py            # 技能运行时状态
│   ├── stats.py            # 属性块
│   └── monster.py          # 怪物生成
│
├── systems/                # 游戏逻辑
│   ├── battle.py           # 战斗核心（BattleIO 抽象）
│   ├── battle_io.py        # CollectingBattleIO → timeline
│   ├── game_controller.py  # Web 业务层
│   ├── forge.py            # 锻造逻辑
│   ├── save_manager.py     # 存档读写
│   ├── equipment_compare.py
│   └── equipment_shop.py   # 售卖 / 分解
│
├── ui/                     # CLI 界面
│   ├── menu.py
│   ├── progress_bar.py
│   └── skill_display.py
│
├── web/                    # Web 服务与前端
│   ├── server.py           # FastAPI REST API
│   └── static/             # index.html / app.js / style.css
│
└── saves/                  # 角色存档（JSON）
    ├── master.json         # 角色索引
    └── {角色名}.json
```

---

## 架构说明

```
┌─────────────┐     ┌─────────────┐
│  ui/menu.py │     │ web/server  │
│   (CLI)     │     │  + static   │
└──────┬──────┘     └──────┬──────┘
       │                   │
       │            game_controller.py
       │                   │
       └─────────┬─────────┘
                 ▼
         battle / forge / save ...
                 ▼
           models + config
```

- **战斗 IO 抽象**：`BattleSystem` 通过 `io` 参数输出战斗过程。CLI 使用带延迟的文字输出；Web 使用 `CollectingBattleIO` 收集 `timeline` 事件供前端播放。
- **配置驱动**：新增职业、技能、词缀时优先修改 `config/`，逻辑层尽量复用。

---

## Web API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes` | 职业列表 |
| GET | `/api/characters` | 角色列表 |
| POST | `/api/characters` | 创建角色 |
| GET | `/api/characters/{name}` | 加载角色 |
| DELETE | `/api/characters/{name}` | 删除角色 |
| POST | `/api/characters/{name}/battle` | 战斗（可选 `target_floor` 刷层） |
| POST | `/api/characters/{name}/skills/learn` | 学习技能 |
| POST | `/api/characters/{name}/skills/unlearn` | 遗忘技能 |
| POST | `/api/characters/{name}/skills/reset` | 重置全部技能 |
| POST | `/api/characters/{name}/equip` | 装备 |
| POST | `/api/characters/{name}/inventory/sell` | 售卖 |
| POST | `/api/characters/{name}/inventory/dismantle` | 分解 |
| POST | `/api/characters/{name}/inventory/sell-all` | 一键售卖 |
| POST | `/api/characters/{name}/inventory/dismantle-all` | 一键分解 |
| POST | `/api/characters/{name}/forge` | 锻造部位 |

---

## 扩展指南

### 新增职业

1. 在 `config/classes.py` 的 `CLASS_REGISTRY` 注册基础属性
2. 在 `config/skills.py` 添加技能模板与 `CLASS_SKILL_TREES` 条目

### 新增技能

在 `config/skills.py` 的 `SKILL_REGISTRY` 添加 `SkillTemplate`，并加入对应职业技能树。

### 新增词缀 / 调整数值

修改 `config/constants.py` 中的 `AFFIX_DEFINITIONS`、`SLOT_AFFIX_ALLOWED` 及层数相关常量。

### 图形化战斗（规划）

当前 Web 战斗为文字 timeline 播放。后续可：

1. 扩展 `battle_io.py`，输出结构化事件（`skill_cast`、`hp_update` 等）
2. 前端接入 Phaser / PixiJS 等 2D 引擎，按 `skill_id` 映射动画与特效
3. Python 战斗逻辑无需改动，仅替换表现层

---

## 已知差异（CLI vs Web）

| 功能 | CLI | Web |
|------|-----|-----|
| 丢弃装备 | ✓ | — |
| 删除角色 | ✓ | API 有，UI 未接 |
| 详细装备对比 | ✓ | 简略显示 |
| 战斗表现 | 终端文字 + 血条 | 弹层 timeline 动画 |

---

## 许可

个人学习 / 实验项目，可自由修改与扩展。
