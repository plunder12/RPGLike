# 文字暗黑 · 无限爬塔

类暗黑风格的爬塔 RPG。同一套 Python 数值与 JSON 存档，支持 **命令行（CLI）**、**Web 文字版** 与 **Web 2D 实时 ARPG** 三种玩法，角色数据完全互通。

当前版本：**v0.4**（含 Phaser 3 俯视角实时战斗）

---

## 特性概览

### 核心养成（三种模式共用）

- **三种职业**：野蛮人、法师、武僧，各有独立技能树与资源（怒气 / 法力 / 真气）
- **无限爬塔**：最高 50 层，每 10 层 BOSS，随机精英怪
- **技能系统**：升级获得技能点，每技能最多 3 级；支持主动 / 被动、学习、遗忘、全部重置
- **装备系统**：6 部位（武器、头盔、胸甲、手套、靴子、戒指）、4 品质（普通 / 魔法 / 稀有 / 传奇），词缀按部位约束
- **移速属性**：角色基础移速 + 鞋子词缀（固定移速 / 百分比移速，含上限保护）
- **背包管理**：装备对比（↑提升 / ↓降低 / ≈相近 / 新部位）、售卖、分解，支持一键售卖 / 一键分解
- **部位锻造**：按槽位强化（与具体装备无关），每级 +10% 该部位词缀 + 固定属性，最高 Lv.50
- **刷层模式**：回顾已通关层数 farming，经验与金币为正常的 50%
- **存档**：`saves/` 目录 JSON 存储，CLI 与 Web 共享

### Web 文字版（`/`）

- 全自动回合战斗，timeline 弹层回放战斗过程
- 城镇菜单：状态、背包、技能、锻造、爬塔

### Web 2D ARPG（`/game`）★ 新增

- **Phaser 3** 俯视角实时战斗：WASD 移动、范围内自动普攻、左键锁定目标
- **技能栏** Q / E / R / F：实时 CD、资源消耗、伤害 / 治疗 / Buff / 控制
- **敌人 AI**：巡逻、追击、近身攻击；普通 / 精英 / BOSS 区分
- **城镇闭环**：背包、技能、锻造、属性面板；选层后进入地牢
- **清场结算**：击杀记录回传服务端，发放经验 / 金币 / 材料 / 掉落并推进层数
- **回城休息**：自动满血满资源（`/api/characters/{name}/rest`）
- **战斗暂停**：右上角菜单或 ESC，可继续或返回城镇

> 详细改造计划与阶段路线见 [`docs/2D_ARPG_PLAN.md`](docs/2D_ARPG_PLAN.md)

---

## 环境要求

- Python 3.10+
- CLI 版无第三方依赖（标准库即可）
- Web 版额外需要：`fastapi`、`uvicorn`、`pydantic`（见 `requirements-web.txt`）
- 2D 游戏页通过 CDN 加载 Phaser 3，无需 Node.js 构建

---

## 快速开始

### 命令行版

```bash
cd RPGLike
python main.py
```

### Web 版（文字 + 2D 游戏）

```bash
cd RPGLike
pip install -r requirements-web.txt
python main_web.py
```

| 地址 | 说明 |
|------|------|
| http://127.0.0.1:8765 | Web 文字版（回合战斗 + timeline） |
| http://127.0.0.1:8765/game | **2D ARPG**（Phaser 实时战斗） |

开发时可用热重载：

```bash
python -m uvicorn web.server:app --host 127.0.0.1 --port 8765 --reload
```

> CLI 与 Web 读写同一 `saves/` 目录，在文字版练的角色可直接在 2D 版中使用。

---

## 2D ARPG 玩法

### 流程

```
选角 / 建角 (TitleScene)
    → 城镇 (TownScene)：背包 / 技能 / 锻造 / 状态，选择目标层
    → 地牢 (DungeonScene)：实时战斗
    → 清场结算 → 返回城镇
    （阵亡或暂停菜单也可回城）
```

### 操作

| 操作 | 说明 |
|------|------|
| WASD / 方向键 | 移动（移速受角色属性与鞋子词缀影响） |
| 自动攻击 | 进入金色攻击圈后自动攻击最近敌人 |
| 左键点击敌人 | 锁定目标，优先攻击该怪 |
| 左键点击空地 | 取消锁定，恢复自动选最近目标 |
| Q / E / R / F | 释放已学主动技能（按槽位顺序绑定） |
| ≡ 或 ESC | 暂停菜单：继续游戏 / 返回城镇 |

### 城镇功能

- **背包**：左侧已装备（含锻造等级与完整词缀），右侧背包列表（对比标签、装备 / 售卖 / 分解）
- **技能**：查看职业技能树，消耗技能点学习或重置
- **锻造**：按部位强化，显示费用与效果说明
- **状态**：攻击、防御、暴击、移速等完整属性
- **进入地牢**：底部选择目标层（推进层或已解锁的刷层）

---

## 游戏玩法（通用规则）

### 创建角色

初始仅拥有 **普通攻击**，升级后获得技能点，在技能菜单中学习职业专属技能。

### 爬塔

| 模式 | 说明 |
|------|------|
| 推进爬塔 | 挑战当前最高层，胜利后解锁下一层 |
| 回顾刷层 | 重复挑战已通关层，收益 50%，用于刷装备与材料 |

### 战斗规则

**文字版（回合制）**

- 我方每回合：普攻 → 按顺序尝试所有就绪技能
- 技能独立 CD；仅普攻恢复资源
- 怪物回合：单次攻击

**2D 版（实时）**

- 帧循环在浏览器本地运行，伤害由前端 `combat.js` 按配置数值量级计算
- 清场或阵亡后由 Python 服务端结算奖励并存档（权威数据层）
- 回城时自动满血满资源

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
RPGLike/
├── main.py                 # CLI 入口
├── main_web.py             # Web 入口（uvicorn :8765）
├── requirements-web.txt
│
├── config/                 # 静态配置
│   ├── classes.py          # 职业（含移速）
│   ├── skills.py           # 技能注册表与技能树
│   ├── forge.py            # 锻造消耗与部位加成
│   └── constants.py        # 词缀、层数、掉落、移速词缀等
│
├── models/                 # 数据模型
│   ├── character.py        # 角色（技能点、锻造、背包）
│   ├── equipment.py        # 装备生成与词缀（含移速上限）
│   ├── skill.py            # 技能运行时状态
│   ├── stats.py            # 属性块（含 effective_move_speed）
│   └── monster.py          # 怪物生成
│
├── systems/                # 游戏逻辑
│   ├── battle.py           # 文字版回合战斗
│   ├── battle_io.py        # CollectingBattleIO → timeline
│   ├── game_controller.py  # Web 业务层（含 start_floor / clear_floor / rest）
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
├── web/
│   ├── server.py           # FastAPI REST API
│   └── static/
│       ├── index.html      # 文字版前端
│       ├── app.js / style.css
│       └── game/           # ★ 2D ARPG（Phaser 3）
│           ├── main.js
│           ├── index.html
│           ├── constants.js
│           ├── scenes/
│           │   ├── BootScene.js
│           │   ├── TitleScene.js
│           │   ├── TownScene.js
│           │   ├── DungeonScene.js
│           │   └── UIScene.js
│           ├── entities/
│           │   └── Enemy.js
│           ├── systems/
│           │   ├── apiClient.js
│           │   └── combat.js
│           └── ui/
│               ├── Hud.js
│               └── SkillBar.js
│
├── docs/
│   └── 2D_ARPG_PLAN.md     # 2D 改造计划与阶段路线
│
└── saves/                  # 角色存档（JSON）
```

---

## 架构说明

```
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────────┐
│   ui/menu.py     │  │  web/static/     │  │  web/static/game/       │
│   (CLI)          │  │  文字版前端       │  │  Phaser 3 实时战斗 ★    │
└────────┬─────────┘  └────────┬─────────┘  └────────────┬────────────┘
         │                       │                          │
         │              ┌────────┴──────────────────────────┘
         │              ▼
         │       game_controller.py
         │              │
         └──────────────┼──────────────────────────┐
                        ▼                          ▼
              battle / forge / save ...      floor/start · clear · rest
                        ▼
                  models + config
```

- **文字战斗**：`BattleSystem` 通过 `BattleIO` 输出过程；Web 使用 `CollectingBattleIO` 生成 `timeline` 供前端播放。
- **实时战斗**：帧循环在浏览器；Python 仅在「进层」「清场」「回城休息」等节点通信，负责怪物配置下发与奖励结算。
- **配置驱动**：职业、技能、词缀、锻造、层数曲线均集中在 `config/`，三种前端共用同一套数值。

---

## Web API 概览

### 角色与养成

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/classes` | 职业列表 |
| GET | `/api/characters` | 角色列表 |
| POST | `/api/characters` | 创建角色 |
| GET | `/api/characters/{name}` | 加载角色 |
| DELETE | `/api/characters/{name}` | 删除角色 |
| POST | `/api/characters/{name}/rest` | 回城休息（满血满资源并存档） |

### 战斗

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/characters/{name}/battle` | 文字版回合战斗（可选 `target_floor` 刷层） |
| POST | `/api/characters/{name}/floor/start` | **2D 版** 进入一层，返回怪物与技能配置 |
| POST | `/api/characters/{name}/floor/clear` | **2D 版** 清场结算（经验 / 金币 / 掉落 / 层数） |

### 技能 / 装备 / 锻造

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/characters/{name}/skills` | 技能列表 |
| POST | `/api/characters/{name}/skills/learn` | 学习技能 |
| POST | `/api/characters/{name}/skills/unlearn` | 遗忘技能 |
| POST | `/api/characters/{name}/skills/reset` | 重置全部技能 |
| POST | `/api/characters/{name}/equip` | 装备 |
| POST | `/api/characters/{name}/inventory/sell` | 售卖 |
| POST | `/api/characters/{name}/inventory/dismantle` | 分解 |
| POST | `/api/characters/{name}/inventory/sell-all` | 一键售卖 |
| POST | `/api/characters/{name}/inventory/dismantle-all` | 一键分解 |
| POST | `/api/characters/{name}/forge` | 锻造部位 |

### 页面

| 路径 | 说明 |
|------|------|
| `/` | Web 文字版 |
| `/game` | 2D ARPG 入口 |

---

## 开发路线（2D ARPG）

| 阶段 | 状态 | 内容 |
|------|------|------|
| Phase 0 | ✅ | Phaser 工程、地图碰撞、占位图形 |
| Phase 1 | ✅ | 选角、HUD、移速属性 |
| Phase 2 | ✅ | 实时战斗、敌人 AI、自动 / 锁定攻击 |
| Phase 3 | ✅ | 技能栏、CD、资源、Buff / 控制 |
| Phase 4 | ✅ | 清场结算、城镇闭环、养成 UI |
| Phase 5 | 待做 | 正式美术、音效、飘字、小地图等打磨 |

---

## 扩展指南

### 新增职业

1. 在 `config/classes.py` 的 `CLASS_REGISTRY` 注册基础属性（含 `move_speed`）
2. 在 `config/skills.py` 添加技能模板与 `CLASS_SKILL_TREES` 条目

### 新增技能

在 `config/skills.py` 的 `SKILL_REGISTRY` 添加 `SkillTemplate`，并加入对应职业技能树。2D 版会自动通过 `start_floor` 下发已学主动技能。

### 新增词缀 / 调整数值

修改 `config/constants.py` 中的 `AFFIX_DEFINITIONS`、`SLOT_AFFIX_ALLOWED` 及层数相关常量。

### 扩展 2D 战斗表现

- 替换 `BootScene.js` 中的占位纹理为正式 sprite / tileset
- 在 `DungeonScene.js` 中扩展技能特效与受击反馈
- 详见 [`docs/2D_ARPG_PLAN.md`](docs/2D_ARPG_PLAN.md) Phase 5

---

## 模式对比

| 功能 | CLI | Web 文字版 | Web 2D ARPG |
|------|-----|-----------|-------------|
| 战斗方式 | 回合自动 | 回合 + timeline | 实时动作 |
| 城镇 / 养成 | 终端菜单 | 网页菜单 | TownScene |
| 丢弃装备 | ✓ | — | — |
| 装备对比 | 详细 | 简略 | 背包对比标签 |
| 移速 / 鞋子词缀 | 数值生效 | 数值生效 | 数值 + 移动表现 |
| 共享存档 | ✓ | ✓ | ✓ |

---

## 许可

个人学习 / 实验项目，可自由修改与扩展。
