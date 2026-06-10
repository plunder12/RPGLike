// DungeonScene：Phase 3 实时战斗 + 技能系统。
//   移动：WASD / 方向键
//   普攻：进入攻击圆范围内始终攻击距离最近的敌人（450ms 内置 CD，进出范围不重置）
//   技能：Q / E / R / F 对应已学主动技能（按位置顺序绑定）
//   资源：普攻回复，技能消耗，每秒按 resource_regen 回复
//   HP  ：每秒按 hp_regen 回复

import {
  TILE,
  PLAYER_SPEED,
  COLORS,
  TEST_MAP,
  MAP_COLS,
  MAP_ROWS,
  MAP_WIDTH,
  MAP_HEIGHT,
  BASIC_ATTACK_RANGE,
  getAttackRange,
  SKILL_RANGES,
} from "../constants.js";
import { Api } from "../systems/apiClient.js";
import { playerHitDamage, skillHitDamage, monsterHitDamage } from "../systems/combat.js";
import Enemy from "../entities/Enemy.js";

const PLAYER_ATTACK_CD = 450;
const BASIC_RESOURCE_GAIN = 10; // 普攻回复资源量

export default class DungeonScene extends Phaser.Scene {
  constructor() {
    super("DungeonScene");
  }

  init(data) {
    this.character = data && data.character ? data.character : null;
    this.targetFloor = data?.targetFloor ?? null;  // 来自 TownScene 的目标层
    const ms = this.character?.stats?.move_speed;
    this.playerSpeed = ms || PLAYER_SPEED;
    const classId = this.character?.class_id ?? "barbarian";
    this.attackRange = getAttackRange(classId);

    this.attackTarget = null;
    this.nextPlayerAttackAt = 0;
    this.enemies = [];
    this.cleared = false;
    this.dead = false;
    this.killLog = [];       // 记录每次击杀 {is_boss, is_elite}
    this.floorMode = "push"; // 进入层后由 _startFloor 更新

    const s = this.character ? this.character.stats : {};
    this.playerHp = s.hp != null ? s.hp : (s.max_hp || 100);
    this.playerMaxHp = s.max_hp || 100;
    this.playerResource = this.character ? (this.character.resource || 0) : 0;
    this.playerMaxResource = this.character ? (this.character.resource_max || 0) : 0;

    // 技能列表（进入层后填充）
    this.skills = [];
    this.skillKeys = null;

    // 战吼 buff
    this.buffDamage = 0;
    this.buffExpireAt = 0;
  }

  create() {
    // 防止上次暂停菜单遗留的 pause 状态导致场景卡死
    if (this.scene.isPaused()) this.scene.resume();

    this.cameras.main.setBackgroundColor(COLORS.bg);

    this._buildMap();
    this._createPlayer();
    this._setupCamera();
    this._setupInput();

    // 重启 UIScene，避免残留暂停状态或重复监听
    if (this.scene.isActive("UIScene")) this.scene.stop("UIScene");
    this.scene.launch("UIScene", { character: this.character, skills: this.skills });

    this._buildRangeCircle();
    this._buildTargetIndicator();
    this._createHint();
    this._startRegenTimer();
    this._startFloor();
  }

  // ── 地图 ──────────────────────────────────────────────────

  _buildMap() {
    this.walls = this.physics.add.staticGroup();
    this.floorTiles = [];

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const x = col * TILE + TILE / 2;
        const y = row * TILE + TILE / 2;
        if (TEST_MAP[row][col] === 1) {
          const wall = this.add.image(x, y, "tile_wall");
          this.physics.add.existing(wall, true);
          this.walls.add(wall);
        } else {
          const key = (row + col) % 2 === 0 ? "tile_floor" : "tile_floor_alt";
          this.add.image(x, y, key);
          this.floorTiles.push({ x, y });
        }
      }
    }
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  _createPlayer() {
    const spawn = this.floorTiles[0] || { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    this.spawnPoint = spawn;
    this.player = this.physics.add.image(spawn.x, spawn.y, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(TILE - 8, TILE - 8, true);
    this.physics.add.collider(this.player, this.walls);

    this.enemyGroup = this.physics.add.group();
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.overlap(this.player, this.enemyGroup);
  }

  _buildRangeCircle() {
    if (this.rangeCircle?.active) return;
    if (this.rangeCircle) this.rangeCircle.destroy();
    const r = this.attackRange ?? BASIC_ATTACK_RANGE;
    this.rangeCircle = this.add
      .circle(0, 0, r, 0xffffff, 0.03)
      .setStrokeStyle(1, 0xffffff, 0.22)
      .setDepth(400);
    this._rangeStyleActive = false;
  }

  _buildTargetIndicator() {
    this.targetGfx = this.add.graphics().setDepth(399);
  }

  _updateTargetIndicator() {
    this.targetGfx.clear();
    if (!this.attackTarget || !this.attackTarget.alive) return;
    const { x, y } = this.attackTarget.sprite;
    this.targetGfx.lineStyle(2, 0xffd54a, 0.9);
    this.targetGfx.strokeCircle(x, y, 18);
    const r = 22, len = 6;
    for (const [dx, dy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      this.targetGfx.lineBetween(x + dx*r, y + dy*r, x + dx*(r-len), y + dy*r);
      this.targetGfx.lineBetween(x + dx*r, y + dy*r, x + dx*r, y + dy*(r-len));
    }
  }

  _setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(1.5);
  }

  // ── 输入 ──────────────────────────────────────────────────

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    // ESC 由 UIScene 的暂停菜单统一处理
  }

  shutdown() {
    this.input.off("pointerdown");
    if (this.regenTimer) {
      this.regenTimer.destroy();
      this.regenTimer = null;
    }
    this.rangeCircle?.destroy();
    this.rangeCircle = null;
    if (this.scene.isPaused()) this.scene.resume();
  }

  _bindSkillKeys() {
    if (this.skills.length === 0) return;
    const keyNames = this.skills.map(s => s.key).filter(Boolean).join(",");
    if (!keyNames) return;
    this.skillKeys = this.input.keyboard.addKeys(keyNames);
  }

  _createHint() {
    const cam = this.cameras.main;
    this.add
      .text(10, cam.height - 10,
        "WASD 移动 · 自动攻击最近目标（金圈）· Q/E/R/F 技能 · ESC 暂停", {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "12px",
          color: "#9a9088",
          backgroundColor: "rgba(15,14,18,0.6)",
          padding: { x: 8, y: 5 },
        })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(2000);
  }

  // ── 层加载 ───────────────────────────────────────────────

  async _startFloor() {
    if (!this.character) return;
    try {
      const data = await Api.startFloor(this.character.name, this.targetFloor);
      this._banner(
        `${data.mode === "farm" ? "刷层" : "推进"} · 第 ${data.floor} 层 · 怪物 ${data.monsters.length}`,
        1600
      );
      this.currentFloor = data.floor;
      this.floorMode = data.mode;
      this._spawnMonsters(data.monsters);

      // 初始化技能（数据填入 this.skills，UIScene 持有相同引用）
      if (data.active_skills && data.active_skills.length > 0) {
        data.active_skills.forEach(s => {
          this.skills.push({ ...s, nextReadyAt: 0 });
        });
        this._bindSkillKeys();
        const ui = this.scene.get("UIScene");
        if (ui && ui.initSkills) ui.initSkills(this.skills);
      }
    } catch (e) {
      this._banner(`加载失败：${e.message}`, 3000);
    }
  }

  _spawnMonsters(monsters) {
    const far = this.floorTiles.filter(
      t => Phaser.Math.Distance.Between(t.x, t.y, this.spawnPoint.x, this.spawnPoint.y) > TILE * 4
    );
    const pool = far.length >= monsters.length ? far : this.floorTiles;

    monsters.forEach(m => {
      const spot = Phaser.Utils.Array.GetRandom(pool);
      const enemy = new Enemy(this, spot.x, spot.y, m);
      this.enemyGroup.add(enemy.sprite);
      this.enemies.push(enemy);
    });
    this.aliveCount = this.enemies.length;
  }

  // ── 回复计时器 ───────────────────────────────────────────

  _startRegenTimer() {
    if (this.regenTimer) this.regenTimer.destroy();
    this.regenTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.dead) return;
        const s = this.character?.stats || {};
        let changed = false;

        if (s.hp_regen > 0 && this.playerHp < this.playerMaxHp) {
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + s.hp_regen);
          changed = true;
        }
        if (s.resource_regen > 0 && this.playerResource < this.playerMaxResource) {
          this.playerResource = Math.min(this.playerMaxResource, this.playerResource + s.resource_regen);
          changed = true;
        }
        if (changed) this._syncHud();
      },
    });
  }

  // ── 主循环 ───────────────────────────────────────────────

  update(time) {
    if (this.dead) return;

    // 移动
    const body = this.player.body;
    const keyInput = this._readKeyboard();
    if (keyInput.x !== 0 || keyInput.y !== 0) {
      body.setVelocity(
        new Phaser.Math.Vector2(keyInput.x, keyInput.y).normalize().scale(this.playerSpeed).x,
        new Phaser.Math.Vector2(keyInput.x, keyInput.y).normalize().scale(this.playerSpeed).y
      );
    } else {
      body.setVelocity(0, 0);
    }

    // 技能按键
    this._checkSkillKeys(time);

    // 战吼 buff 到期
    if (this.buffDamage > 0 && time >= this.buffExpireAt) {
      this.buffDamage = 0;
    }

    // 自动普攻：每帧选取攻击范围内最近的敌人
    this.attackTarget = this._nearestEnemyInRange();
    if (this.attackTarget?.alive) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.attackTarget.sprite.x, this.attackTarget.sprite.y
      );
      if (dist <= this.attackRange && time >= this.nextPlayerAttackAt) {
        this.nextPlayerAttackAt = time + PLAYER_ATTACK_CD;
        this._attack(this.attackTarget);
      }
    }

    for (const e of this.enemies) e.update(time, this.player);

    this._updateRangeCircle();
    this._updateTargetIndicator();
  }

  _checkSkillKeys(time) {
    if (!this.skillKeys || this.skills.length === 0) return;
    for (const skill of this.skills) {
      if (!skill.key) continue;
      const keyObj = this.skillKeys[skill.key];
      if (keyObj && Phaser.Input.Keyboard.JustDown(keyObj)) {
        this._castSkill(skill, time);
      }
    }
  }

  // ── 普攻 ─────────────────────────────────────────────────

  _attack(target) {
    const isRanged = this.attackRange > BASIC_ATTACK_RANGE + 20;
    if (isRanged) {
      this._projectileFx(this.player.x, this.player.y, target.sprite.x, target.sprite.y);
    } else {
      this._slashFx(target);
    }
    const stats = this.character.stats;
    const { damage, crit } = playerHitDamage(stats, target.defense);
    target.takeDamage(damage);
    this._floatText(
      target.sprite.x, target.sprite.y - 10,
      crit ? `${damage}!` : `${damage}`,
      crit ? "#ffd54a" : "#ffffff", crit
    );
    // 普攻回复资源
    this.playerResource = Math.min(this.playerMaxResource, this.playerResource + BASIC_RESOURCE_GAIN);
    this._syncHud();
  }

  _slashFx(target) {
    const ring = this.add.circle(target.sprite.x, target.sprite.y, 16, 0xffffff, 0.5).setDepth(950);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 180, onComplete: () => ring.destroy() });
  }

  // ── 技能施放 ─────────────────────────────────────────────

  _castSkill(skill, time) {
    if (time < (skill.nextReadyAt || 0)) return; // CD 中
    if (this.playerResource < skill.resource_cost) {
      this._floatText(this.player.x, this.player.y - 10, "资源不足", "#ff6b6b");
      return;
    }

    // 消耗 CD 与资源
    skill.nextReadyAt = time + skill.cd_ms;
    this.playerResource = Math.max(0, this.playerResource - skill.resource_cost);
    this._syncHud();

    if (skill.heal_ratio > 0) {
      this._castHeal(skill);
    } else if (skill.buff_damage > 0) {
      this._castBuff(skill, time);
    } else if (skill.range_type === "aoe") {
      this._castAoe(skill);
    } else if (skill.range_type === "explosion") {
      this._castExplosion(skill);
    } else if (skill.range_type === "ranged") {
      this._castRanged(skill);
    } else {
      this._castMelee(skill);
    }

    // 控制技能：对范围内所有怪物施加减速
    if (skill.control_reduction > 0) {
      this._applyControl(skill.control_reduction, time);
    }
  }

  _castHeal(skill) {
    const heal = Math.floor(this.playerMaxHp * skill.heal_ratio);
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + heal);
    this._syncHud();
    this._floatText(this.player.x, this.player.y - 14, `+${heal}`, "#5cb85c", true);
    this._auraFx(this.player.x, this.player.y, 0x5cb85c, 28);
  }

  _castBuff(skill, time) {
    this.buffDamage = skill.buff_damage;
    this.buffExpireAt = time + 6000;
    const pct = Math.floor(skill.buff_damage * 100);
    this._floatText(this.player.x, this.player.y - 14, `伤害 +${pct}%`, "#c98ad0", true);
    this._auraFx(this.player.x, this.player.y, 0xc98ad0, 32);
  }

  _castAoe(skill) {
    const range = SKILL_RANGES.aoe;
    let hit = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.sprite.x, e.sprite.y);
      if (d <= range) {
        const { damage, crit } = skillHitDamage(this.character.stats, skill, this.buffDamage);
        e.takeDamage(damage);
        this._floatText(e.sprite.x, e.sprite.y - 10,
          crit ? `${damage}!` : `${damage}`, crit ? "#ffd54a" : "#ff9a5a", crit);
        hit++;
      }
    }
    this._aoeFx(this.player.x, this.player.y, range);
    if (hit === 0) this._floatText(this.player.x, this.player.y - 10, "未命中", "#9a9088");
  }

  _castRanged(skill) {
    const range = SKILL_RANGES.ranged;
    const target = (this.attackTarget?.alive ? this.attackTarget : null)
      || this._nearestEnemyInRange(range);
    if (!target) { this._floatText(this.player.x, this.player.y - 10, "无目标", "#9a9088"); return; }
    const { damage, crit } = skillHitDamage(this.character.stats, skill, this.buffDamage);
    target.takeDamage(damage);
    this._floatText(target.sprite.x, target.sprite.y - 10,
      crit ? `${damage}!` : `${damage}`, crit ? "#ffd54a" : "#4a90e2", crit);
    this._projectileFx(this.player.x, this.player.y, target.sprite.x, target.sprite.y);
  }

  /** 投射命中点爆炸：一次 roll 伤害，爆炸范围内所有敌人受到相同数值 */
  _castExplosion(skill) {
    const castRange = SKILL_RANGES.ranged;
    const blastRange = SKILL_RANGES.explosion;
    const target = (this.attackTarget?.alive ? this.attackTarget : null)
      || this._nearestEnemyInRange(castRange);
    if (!target) {
      this._floatText(this.player.x, this.player.y - 10, "无目标", "#9a9088");
      return;
    }
    const { damage, crit } = skillHitDamage(this.character.stats, skill, this.buffDamage);
    const color = crit ? "#ffd54a" : "#ff7a3a";
    this._fireballFx(this.player.x, this.player.y, target, (cx, cy) => {
      let hit = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Phaser.Math.Distance.Between(cx, cy, e.sprite.x, e.sprite.y);
        if (d <= blastRange) {
          e.takeDamage(damage);
          this._floatText(e.sprite.x, e.sprite.y - 10,
            crit ? `${damage}!` : `${damage}`, color, crit);
          hit++;
        }
      }
      this._explosionFx(cx, cy, blastRange);
      if (hit === 0) this._floatText(cx, cy - 10, "未命中", "#9a9088");
    });
  }

  _castMelee(skill) {
    const range = SKILL_RANGES.melee;
    const target = (this.attackTarget?.alive ? this.attackTarget : null)
      || this._nearestEnemyInRange(range);
    if (!target) { this._floatText(this.player.x, this.player.y - 10, "无目标", "#9a9088"); return; }
    const { damage, crit } = skillHitDamage(this.character.stats, skill, this.buffDamage);
    target.takeDamage(damage);
    this._floatText(target.sprite.x, target.sprite.y - 10,
      crit ? `${damage}!` : `${damage}`, crit ? "#ffd54a" : "#ff9a5a", crit);
    this._skillMeleeFx(target.sprite.x, target.sprite.y);
  }

  _applyControl(reduction, time) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.sprite.x, e.sprite.y);
      if (d <= SKILL_RANGES.aoe) {
        e.speedDebuff = reduction;
        e.debuffExpireAt = time + 3000;
        e.sprite.setTint(0x80c8ff); // 冰蓝色提示
      }
    }
  }

  // ── 特效（占位） ─────────────────────────────────────────

  _aoeFx(x, y, range) {
    const fill = this.add.circle(x, y, range, 0xff7a3a, 0.18).setDepth(940);
    const stroke = this.add.circle(x, y, range, 0, 0)
      .setStrokeStyle(2, 0xff7a3a, 0.8).setDepth(941);
    this.tweens.add({
      targets: [fill, stroke],
      alpha: 0,
      scale: 1.15,
      duration: 400,
      onComplete: () => {
        fill.destroy();
        stroke.destroy();
      },
    });
  }

  _projectileFx(x, y, tx, ty) {
    const ball = this.add.circle(x, y, 7, 0x4a90e2, 1).setDepth(950);
    this.tweens.add({
      targets: ball, x: tx, y: ty, duration: 220,
      onComplete: () => {
        const burst = this.add.circle(tx, ty, 14, 0x4a90e2, 0.5).setDepth(951);
        this.tweens.add({ targets: burst, scale: 1.8, alpha: 0, duration: 180, onComplete: () => { burst.destroy(); ball.destroy(); } });
      }
    });
  }

  _fireballFx(x, y, target, onHit) {
    const ball = this.add.circle(x, y, 8, 0xff5522, 1).setDepth(950);
    this.tweens.add({
      targets: ball,
      x: target.sprite.x,
      y: target.sprite.y,
      duration: 240,
      onComplete: () => {
        const cx = ball.x;
        const cy = ball.y;
        ball.destroy();
        if (onHit) onHit(cx, cy);
      },
    });
  }

  _explosionFx(x, y, range) {
    const fill = this.add.circle(x, y, range, 0xff5522, 0.22).setDepth(940);
    const stroke = this.add.circle(x, y, range, 0, 0)
      .setStrokeStyle(2, 0xffaa44, 0.85).setDepth(941);
    this.tweens.add({
      targets: [fill, stroke],
      alpha: 0,
      scale: 1.2,
      duration: 350,
      onComplete: () => {
        fill.destroy();
        stroke.destroy();
      },
    });
  }

  _skillMeleeFx(x, y) {
    const slash = this.add.star(x, y, 5, 8, 22, 0xffd54a, 0.8).setDepth(950);
    this.tweens.add({ targets: slash, scale: 1.5, alpha: 0, angle: 120, duration: 220, onComplete: () => slash.destroy() });
  }

  _auraFx(x, y, color, r) {
    const ring = this.add.circle(x, y, r, color, 0.35).setDepth(950);
    this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
  }

  // ── 受敌回调 ─────────────────────────────────────────────

  onEnemyAttack(enemy) {
    if (this.dead) return;
    const def = this.character?.stats?.defense || 0;
    const dmg = monsterHitDamage(enemy.attack, def);
    this.playerHp = Math.max(0, this.playerHp - dmg);
    this._floatText(this.player.x, this.player.y - 12, `-${dmg}`, "#ff6b6b");
    this.cameras.main.flash(80, 120, 0, 0);
    this._syncHud();
    if (this.playerHp <= 0) this._onPlayerDead();
  }

  onEnemyDeath(enemy) {
    this.killLog.push({ is_boss: enemy.isBoss, is_elite: enemy.isElite });
    this.aliveCount -= 1;
    if (this.aliveCount <= 0 && !this.cleared) {
      this.cleared = true;
      this._banner("清空本层！正在结算…", 1200);
      this.time.delayedCall(800, () => this._clearFloor());
    }
  }

  async _clearFloor() {
    try {
      const result = await Api.clearFloor(
        this.character.name,
        this.currentFloor,
        this.floorMode,
        this.killLog
      );
      // 用最新角色数据更新本地 character（含新层数）
      this.character = result.character;
      this._syncHud();
      this._showClearResult(result);
    } catch (e) {
      this._banner(`结算失败：${e.message}`, 3000);
    }
  }

  _showClearResult(result) {
    const cam = this.cameras.main;
    const W = 480, H = 320;
    const px = (cam.width - W) / 2, py = (cam.height - H) / 2;
    const DEPTH = 4000;
    const FONT = "Microsoft YaHei, sans-serif";

    // 背景面板
    const panel = this.add
      .rectangle(px, py, W, H, 0x0f0e12, 0.96)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH)
      .setStrokeStyle(2, 0xc9a227);

    const lines = [];
    lines.push(`✓ 第 ${result.character.floor - 1 > 0 ? this.currentFloor : this.currentFloor} 层清场！`);
    lines.push(`经验  +${result.total_exp}`);
    if (result.level_msgs.length) lines.push(result.level_msgs.join("  "));
    lines.push(`金币  +${result.total_gold}`);
    const matStr = Object.entries(result.total_materials)
      .filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join("  ");
    if (matStr) lines.push(`材料  ${matStr}`);
    if (result.drops.length) {
      lines.push("─── 掉落 ───");
      result.drops.slice(0, 4).forEach(d => lines.push(d.summary));
      if (result.drops.length > 4) lines.push(`… 等共 ${result.drops.length} 件`);
    }
    if (result.overflow_count > 0)
      lines.push(`⚠ 背包已满，${result.overflow_count} 件掉落未拾取`);

    // 文字内容
    this.add
      .text(px + W / 2, py + 18, lines[0], {
        fontFamily: FONT, fontSize: "20px", color: "#c9a227",
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 1);

    this.add
      .text(px + 24, py + 54, lines.slice(1).join("\n"), {
        fontFamily: FONT, fontSize: "14px", color: "#e8e0d5",
        lineSpacing: 6,
      })
      .setScrollFactor(0).setDepth(DEPTH + 1);

    // "前往城镇" 按钮
    const btnY = py + H - 44;
    const btn = this.add
      .text(px + W / 2, btnY, "前往城镇", {
        fontFamily: FONT, fontSize: "17px", color: "#0f0e12",
        backgroundColor: "#c9a227", padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#e8c040" }));
    btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#c9a227" }));
    btn.on("pointerdown", () => {
      if (this.scene.isPaused()) this.scene.resume();
      panel.destroy();
      btn.destroy();
      this.scene.stop("UIScene");
      this.scene.start("TownScene", { character: this.character });
    });
  }

  // ── HUD 同步 ─────────────────────────────────────────────

  _syncHud() {
    if (this.character) {
      this.character.stats.hp = this.playerHp;
      this.character.resource = this.playerResource;
    }
    const ui = this.scene.get("UIScene");
    if (ui?.updateCharacter) ui.updateCharacter(this.character);
  }

  _onPlayerDead() {
    if (this.dead) return;
    this.dead = true;
    this.player.body.setVelocity(0, 0);
    this._showDefeatScreen();
  }

  _showDefeatScreen() {
    const cam = this.cameras.main;
    const W = 400, H = 220;
    const px = (cam.width - W) / 2, py = (cam.height - H) / 2;
    const DEPTH = 5000;
    const FONT = "Microsoft YaHei, sans-serif";

    const overlay = this.add.rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(DEPTH);
    const panel = this.add.rectangle(px, py, W, H, 0x1a0e14, 0.98)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1)
      .setStrokeStyle(2, 0xd04040);
    const title = this.add.text(px + W / 2, py + 24, "战败", {
      fontFamily: FONT, fontSize: "26px", color: "#d04040",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2);
    const sub = this.add.text(px + W / 2, py + 62, `第 ${this.currentFloor ?? "?"} 层挑战失败`, {
      fontFamily: FONT, fontSize: "14px", color: "#a09090",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2);

    const mkBtn = (label, x, y, color, bg, cb) => {
      const b = this.add.text(x, y, label, {
        fontFamily: FONT, fontSize: "16px", color,
        backgroundColor: bg, padding: { x: 22, y: 10 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true });
      b.on("pointerover", () => b.setAlpha(0.85));
      b.on("pointerout", () => b.setAlpha(1));
      b.on("pointerdown", cb);
      return b;
    };

    const btnY = py + H - 56;
    const retryBtn = mkBtn("再来一局", px + W / 2 - 90, btnY, "#0f0e12", "#c9a227", () => {
      this._retryFloor();
    });
    const townBtn = mkBtn("返回城镇", px + W / 2 + 90, btnY, "#e8e0d5", "#2a2040", () => {
      this._goTownAfterDeath();
    });

    this._defeatObjs = [overlay, panel, title, sub, retryBtn, townBtn];
  }

  async _retryFloor() {
    if (this.scene.isPaused()) this.scene.resume();
    const floor = this.targetFloor ?? this.currentFloor;
    try {
      const char = await Api.rest(this.character.name);
      this.scene.stop("UIScene");
      this.scene.start("DungeonScene", { character: char, targetFloor: floor });
    } catch {
      this.scene.stop("UIScene");
      this.scene.start("DungeonScene", {
        character: this.character,
        targetFloor: floor,
      });
    }
  }

  async _goTownAfterDeath() {
    if (this.scene.isPaused()) this.scene.resume();
    try {
      const char = await Api.rest(this.character.name);
      this.scene.stop("UIScene");
      this.scene.start("TownScene", { character: char });
    } catch {
      this.scene.stop("UIScene");
      this.scene.start("TownScene", { character: this.character });
    }
  }

  // ── 辅助 ─────────────────────────────────────────────────

  _nearestEnemyInRange(range) {
    const maxR = range ?? this.attackRange ?? BASIC_ATTACK_RANGE;
    let best = null, bestDist = maxR;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.sprite.x, e.sprite.y);
      if (d <= bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  _updateRangeCircle() {
    if (!this.player?.active) return;
    if (!this.rangeCircle?.active) this._buildRangeCircle();
    if (!this.rangeCircle) return;

    const r = this.attackRange ?? BASIC_ATTACK_RANGE;
    this.rangeCircle.setPosition(this.player.x, this.player.y);
    if (this.rangeCircle.radius !== r) this.rangeCircle.setRadius(r);

    const inRange = this.attackTarget?.alive &&
      Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.attackTarget.sprite.x, this.attackTarget.sprite.y
      ) <= r;

    if (!!inRange !== this._rangeStyleActive) {
      this._rangeStyleActive = !!inRange;
      if (inRange) {
        this.rangeCircle.setFillStyle(0xffd54a, 0.07);
        this.rangeCircle.setStrokeStyle(1.5, 0xffd54a, 0.75);
      } else {
        this.rangeCircle.setFillStyle(0xffffff, 0.03);
        this.rangeCircle.setStrokeStyle(1, 0xffffff, 0.22);
      }
    }
  }

  _floatText(x, y, text, color, big = false) {
    const t = this.add.text(x, y, text, {
      fontFamily: "Microsoft YaHei, sans-serif",
      fontSize: big ? "18px" : "14px",
      color, stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  _banner(text, duration = 2000) {
    const cam = this.cameras.main;
    const b = this.add.text(cam.width / 2, 70, text, {
      fontFamily: "Microsoft YaHei, sans-serif", fontSize: "18px",
      color: "#e8e0d5", backgroundColor: "rgba(15,14,18,0.85)",
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3000);
    this.time.delayedCall(duration, () => b.destroy());
  }

  _readKeyboard() {
    let x = 0, y = 0;
    if (this.keys.A.isDown || this.cursors.left.isDown) x -= 1;
    if (this.keys.D.isDown || this.cursors.right.isDown) x += 1;
    if (this.keys.W.isDown || this.cursors.up.isDown) y -= 1;
    if (this.keys.S.isDown || this.cursors.down.isDown) y += 1;
    return { x, y };
  }
}
