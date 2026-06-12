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
  BASIC_ATTACK_RANGE,
  getAttackRange,
  SKILL_RANGES,
  CHAR_SCALE,
  PLAYER_CLASSES,
} from "../constants.js";
import { Api } from "../systems/apiClient.js";
import { playerHitDamage, skillHitDamage, monsterHitDamage } from "../systems/combat.js";
import { isDungeonUiZone, isTouchDevice } from "../systems/inputZones.js";
import { buildRiftMap, tileCenter, CHUNK_COLS, GAP_ROWS, getBossArenaBounds } from "../systems/riftMap.js";
import { setWalkGrid } from "../systems/pathfinding.js";
import Enemy from "../entities/Enemy.js";

const PLAYER_ATTACK_CD = 450;
const BASIC_RESOURCE_GAIN = 10;
const MOVE_ARRIVAL = 14;
const ENEMY_CLICK_RADIUS = 34;
/** 首领刷新：与玩家至少相隔的曼哈顿格数，保证反应时间 */
const BOSS_SPAWN_MIN_DIST = 5;

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
    this.playerClassId = PLAYER_CLASSES.includes(classId) ? classId : "barbarian";

    this.attackTarget = null;
    this.lockedTarget = null;
    this.moveTarget = null;
    this.moveMarker = null;
    this.nextPlayerAttackAt = 0;
    this.enemies = [];
    this.cleared = false;
    this.dead = false;
    this.killLog = [];
    this.floorMode = "push";

    // 秘境状态
    this.riftPhase = "explore";
    this.killQuota = 0;
    this.killProgress = 0;
    this.riftMap = null;
    this.chunkSpawns = [];
    this.chunkSpawned = [];
    this.currentChunk = 0;
    this.bossData = null;
    this.mapReady = false;

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

    this.playerAttacking = false;
  }

  create() {
    // 防止上次暂停菜单遗留的 pause 状态导致场景卡死
    if (this.scene.isPaused()) this.scene.resume();

    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.walls = this.physics.add.staticGroup();
    this.floorTiles = [];
    this.enemyGroup = this.physics.add.group();
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);

    this._setupInput();
    if (this.scene.isActive("UIScene")) this.scene.stop("UIScene");
    this.scene.launch("UIScene", { character: this.character, skills: this.skills });

    this._createHint();
    this._startRegenTimer();
    this._startFloor();
  }

  // ── 秘境地图 ──────────────────────────────────────────────

  _buildRiftMap(numChunks) {
    this.riftMap = buildRiftMap(numChunks);
    setWalkGrid(this.riftMap.grid, this.riftMap.cols, this.riftMap.rows);
    this.floorTiles = this.riftMap.floorTiles;

    for (let row = 0; row < this.riftMap.rows; row++) {
      for (let col = 0; col < this.riftMap.cols; col++) {
        const x = col * TILE + TILE / 2;
        const y = row * TILE + TILE / 2;
        if (this.riftMap.grid[row][col] === 1) {
          const wall = this.add.image(x, y, "tile_wall").setDepth(5);
          this.physics.add.existing(wall, true);
          this.walls.add(wall);
        } else {
          const key = (row + col) % 2 === 0 ? "tile_floor" : "tile_floor_alt";
          this.add.image(x, y, key).setDepth(0);
        }
      }
    }
    this.physics.world.setBounds(0, 0, this.riftMap.width, this.riftMap.height);
    this.mapReady = true;
  }

  _addWallCell(col, row) {
    if (!this.riftMap || this.riftMap.grid[row][col] === 1) return;
    this.riftMap.grid[row][col] = 1;
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;
    const wall = this.add.image(x, y, "tile_wall").setDepth(5);
    this.physics.add.existing(wall, true);
    this.walls.add(wall);
  }

  /** 封闭首领房间：墙化房间外所有地面，并封住房间左右缺口 */
  _sealBossArena() {
    if (!this.riftMap) return;
    const { colStart, colEnd } = getBossArenaBounds(this.riftMap.chunkCount);
    const { grid, rows, cols } = this.riftMap;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const inBossRoom = c >= colStart && c <= colEnd;
        if (!inBossRoom && grid[r][c] === 0) {
          this._addWallCell(c, r);
        }
      }
    }
    for (const r of GAP_ROWS) {
      if (grid[r][colStart] === 0) this._addWallCell(colStart, r);
      if (grid[r][colEnd] === 0) this._addWallCell(colEnd, r);
    }
    setWalkGrid(grid, cols, rows);
  }

  _playerChunkIndex() {
    const col = Math.floor(this.player.x / TILE);
    return Phaser.Math.Clamp(
      Math.floor(col / CHUNK_COLS),
      0,
      this.riftMap.chunkCount - 1
    );
  }

  _createPlayer() {
    const start = tileCenter(2, 6);
    this.spawnPoint = start;
    const classId = this.playerClassId;
    const tex = this.textures.exists(classId) ? classId : null;

    if (tex) {
      this.player = this.physics.add.sprite(start.x, start.y, tex, 0);
      this.player.setScale(CHAR_SCALE);
      this.player.setDepth(20);
      this._playPlayerAnim("idle", true);
    } else {
      this.player = this.physics.add.image(start.x, start.y, "player");
      this.player.setDepth(20);
    }

    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(TILE - 8, TILE - 8, true);
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.enemyGroup);
  }

  _playPlayerAnim(state, force = false) {
    if (!this.textures.exists(this.playerClassId)) return;
    const key = `${this.playerClassId}_${state}`;
    if (!this.anims.exists(key)) return;
    if (!force && this.playerAttacking && state !== "attack") return;
    if (this.player.anims.currentAnim?.key === key && state !== "attack") return;
    this.player.play(key, true);
  }

  _triggerPlayerAttackAnim() {
    if (!this.textures.exists(this.playerClassId)) return;
    const key = `${this.playerClassId}_attack`;
    if (!this.anims.exists(key)) return;
    this.playerAttacking = true;
    this.player.play(key);
    this.player.once(`animationcomplete-${key}`, () => {
      this.playerAttacking = false;
    });
  }

  _updatePlayerAnim(body) {
    if (!this.textures.exists(this.playerClassId) || this.playerAttacking) return;
    const moving = body.velocity.x !== 0 || body.velocity.y !== 0;
    if (moving && body.velocity.x !== 0) {
      this.player.setFlipX(body.velocity.x < 0);
    }
    this._playPlayerAnim(moving ? "walk" : "idle");
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
    cam.setBounds(0, 0, this.riftMap.width, this.riftMap.height);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(1.35);
  }

  // ── 输入 ──────────────────────────────────────────────────

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    this._onPointerDown = (pointer) => this._handleWorldPointer(pointer);
    this.input.on("pointerdown", this._onPointerDown);
  }

  /** UIScene 技能栏点击施法 */
  castSkillFromUi(skill) {
    if (this.dead || this.scene.isPaused()) return;
    this._castSkill(skill, this.time.now);
  }

  _handleWorldPointer(pointer) {
    if (this.dead || this.cleared) return;
    const ui = this.scene.get("UIScene");
    if (ui?._paused) return;

    const cam = this.cameras.main;
    const sx = pointer.x;
    const sy = pointer.y;
    const hasJoy = isTouchDevice(this.game);
    if (ui?.isJoystickAt?.(sx, sy)) return;
    if (isDungeonUiZone(sx, sy, cam.width, cam.height, hasJoy)) return;

    const world = cam.getWorldPoint(sx, sy);

    const enemy = this._enemyAtWorldPoint(world.x, world.y);
    if (enemy) {
      this.lockedTarget = enemy;
      this.moveTarget = {
        x: enemy.sprite.x,
        y: enemy.sprite.y,
        follow: enemy,
      };
      this._showMoveMarker(enemy.sprite.x, enemy.sprite.y);
      return;
    }

    this.lockedTarget = null;
    this.moveTarget = { x: world.x, y: world.y };
    this._showMoveMarker(world.x, world.y);
  }

  _enemyAtWorldPoint(wx, wy) {
    let best = null;
    let bestDist = ENEMY_CLICK_RADIUS;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(wx, wy, e.sprite.x, e.sprite.y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  _showMoveMarker(x, y) {
    if (this.moveMarker?.active) this.moveMarker.destroy();
    this.moveMarker = this.add
      .circle(x, y, 8, 0xc9a227, 0.35)
      .setStrokeStyle(1.5, 0xffd54a, 0.85)
      .setDepth(15);
    this.tweens.add({
      targets: this.moveMarker,
      scale: 1.6,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        if (this.moveMarker?.active) {
          this.moveMarker.destroy();
          this.moveMarker = null;
        }
      },
    });
  }

  _readMovementInput() {
    const kb = this._readKeyboard();
    if (kb.x !== 0 || kb.y !== 0) {
      this.moveTarget = null;
      return kb;
    }

    const ui = this.scene.get("UIScene");
    const joy = ui?.getJoystickVector?.();
    if (joy?.active && (Math.abs(joy.x) > 0.12 || Math.abs(joy.y) > 0.12)) {
      this.moveTarget = null;
      return { x: joy.x, y: joy.y };
    }

    if (this.moveTarget) {
      if (this.moveTarget.follow?.alive) {
        this.moveTarget.x = this.moveTarget.follow.sprite.x;
        this.moveTarget.y = this.moveTarget.follow.sprite.y;
      }
      const dx = this.moveTarget.x - this.player.x;
      const dy = this.moveTarget.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= MOVE_ARRIVAL) {
        this.moveTarget = null;
        return { x: 0, y: 0 };
      }
      return { x: dx / dist, y: dy / dist };
    }

    return { x: 0, y: 0 };
  }

  _resolveAttackTarget() {
    if (this.lockedTarget?.alive) return this.lockedTarget;
    return this._nearestEnemyInRange();
  }

  shutdown() {
    if (this._onPointerDown) {
      this.input.off("pointerdown", this._onPointerDown);
      this._onPointerDown = null;
    }
    this.moveMarker?.destroy();
    this.moveMarker = null;
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
    const touch = isTouchDevice(this.game);
    const hint = touch
      ? "向右探索秘境 · 摇杆/点击移动 · 杀满进度出 BOSS · 战败失去奖励"
      : "向右探索 · WASD/点击移动 · 杀满进度 BOSS 战 · 战败失去本轮奖励";
    this.add
      .text(10, cam.height - 10, hint, {
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
      const rift = data.rift;
      this.currentFloor = data.floor;
      this.floorMode = data.mode;
      this.killQuota = rift.kill_quota;
      this.killProgress = 0;
      this.chunkSpawns = rift.chunk_spawns;
      this.bossData = rift.boss;
      this.chunkSpawned = new Array(rift.num_chunks).fill(false);
      this.currentChunk = 0;
      this.riftPhase = "explore";
      this.killLog = [];

      this._buildRiftMap(rift.num_chunks);
      this._createPlayer();
      this._setupCamera();
      this._buildRangeCircle();
      this._buildTargetIndicator();

      this._banner(
        `秘境 · 第 ${data.floor} 层 · ${rift.num_chunks} 地块 · 进度 ${rift.kill_quota}`,
        2200
      );
      this._preSpawnChunk(0);
      if (rift.num_chunks > 1) this._preSpawnChunk(1);
      this._syncRiftHud();

      if (data.active_skills?.length > 0) {
        data.active_skills.forEach(s => {
          this.skills.push({ ...s, nextReadyAt: 0 });
        });
        this._bindSkillKeys();
        const ui = this.scene.get("UIScene");
        if (ui?.initSkills) ui.initSkills(this.skills);
      }
    } catch (e) {
      this._banner(`加载失败：${e.message}`, 3000);
    }
  }

  /** 刷怪点：避开块西侧入口通道，首块再避开玩家出生点 */
  _getChunkSpawnSpots(chunkIndex) {
    const all = this.riftMap.spawnPoints[chunkIndex] || [];
    const ox = this.riftMap.chunkOffsets[chunkIndex];

    if (chunkIndex === 0) {
      const sx = 2;
      const sy = 6;
      const safeR = 5;
      return all.filter(
        (p) => Math.abs(p.col - sx) + Math.abs(p.row - sy) >= safeR
      );
    }

    // 非首块：只在块内偏东 2/3 区域刷怪，避免堵在玩家进块口
    const minCol = ox + 6;
    return all.filter((p) => p.col >= minCol);
  }

  _preSpawnChunk(chunkIndex) {
    if (this.chunkSpawned[chunkIndex]) return;
    const lastChunk = this.riftMap.chunkCount - 1;
    if (this.riftPhase === "boss_pending" && chunkIndex === lastChunk) return;

    this.chunkSpawned[chunkIndex] = true;
    const monsters = this.chunkSpawns[chunkIndex] || [];
    let spots = this._getChunkSpawnSpots(chunkIndex);
    if (!spots.length) {
      spots = [...(this.riftMap.spawnPoints[chunkIndex] || [])];
    }
    this._spawnMonstersInArea(monsters, spots);
  }

  _updateChunkExploration() {
    if (!this.player || this.riftPhase === "boss") return;
    const chunk = this._playerChunkIndex();
    const lastChunk = this.riftMap.chunkCount - 1;

    if (chunk > this.currentChunk) {
      this.currentChunk = chunk;
      const ahead = chunk + 1;
      if (ahead <= lastChunk && !(this.riftPhase === "boss_pending" && ahead === lastChunk)) {
        this._preSpawnChunk(ahead);
      }
    }

    if (this.riftPhase === "boss_pending" && chunk >= lastChunk) {
      this._beginBossFight();
    }
  }

  _spawnMonstersInArea(monsters, spots) {
    if (!monsters.length || !spots.length) return;
    Phaser.Utils.Array.Shuffle(spots);
    monsters.forEach((m, i) => {
      const spot = spots[i % spots.length];
      const enemy = new Enemy(this, spot.x, spot.y, m);
      this.enemyGroup.add(enemy.sprite);
      this.enemies.push(enemy);
    });
  }

  _syncRiftHud() {
    const ui = this.scene.get("UIScene");
    if (ui?.updateRiftProgress) {
      ui.updateRiftProgress(this.killProgress, this.killQuota, this.riftPhase);
    }
  }

  _onKillQuotaComplete() {
    if (this.riftPhase !== "explore") return;

    for (const e of [...this.enemies]) {
      if (e.alive && !e.isBoss) e.forceDespawn();
    }
    this.enemies = this.enemies.filter(e => e.alive);

    const lastChunk = this.riftMap.chunkCount - 1;
    if (this._playerChunkIndex() >= lastChunk) {
      this._beginBossFight();
      return;
    }

    this.riftPhase = "boss_pending";
    this._banner("进度已满！前往最深处，首领等待一战！", 2800);
    this._syncRiftHud();
  }

  /** 首领刷新点：在首领房间内选远离玩家的地面格，避免贴脸 */
  _pickBossSpawnPos() {
    const lastChunk = this.riftMap.chunkCount - 1;
    let spots = this._getChunkSpawnSpots(lastChunk);
    if (!spots.length) {
      spots = [...(this.riftMap.spawnPoints[lastChunk] || [])];
    }

    const { colStart } = getBossArenaBounds(this.riftMap.chunkCount);
    const fallback = () => tileCenter(colStart + CHUNK_COLS - 4, 6);

    if (!spots.length || !this.player?.active) return fallback();

    const pCol = Math.floor(this.player.x / TILE);
    const pRow = Math.floor(this.player.y / TILE);
    const distOf = (spot) =>
      Math.abs(spot.col - pCol) + Math.abs(spot.row - pRow);

    const safe = spots.filter((s) => distOf(s) >= BOSS_SPAWN_MIN_DIST);
    const pool = safe.length ? safe : spots;
    pool.sort((a, b) => distOf(b) - distOf(a));

    const topCount = Math.max(1, Math.ceil(pool.length * 0.4));
    const pick = pool[Phaser.Math.Between(0, topCount - 1)];
    return { x: pick.x, y: pick.y };
  }

  _beginBossFight() {
    if (this.riftPhase === "boss") return;
    this.riftPhase = "boss";
    this._banner("通道封闭！首领降临！", 2400);
    this._sealBossArena();

    const pos = this._pickBossSpawnPos();
    const boss = new Enemy(this, pos.x, pos.y, this.bossData);
    this.enemyGroup.add(boss.sprite);
    this.enemies.push(boss);
    this.lockedTarget = boss;

    this._syncRiftHud();
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
    if (this.dead || !this.player || !this.mapReady) return;

    this._updateChunkExploration();

    // 移动（键盘 / 摇杆 / 鼠标点击）
    const body = this.player.body;
    const moveInput = this._readMovementInput();
    if (moveInput.x !== 0 || moveInput.y !== 0) {
      const v = new Phaser.Math.Vector2(moveInput.x, moveInput.y).normalize().scale(this.playerSpeed);
      body.setVelocity(v.x, v.y);
    } else {
      body.setVelocity(0, 0);
    }
    this._updatePlayerAnim(body);

    // 技能按键
    this._checkSkillKeys(time);

    // 战吼 buff 到期
    if (this.buffDamage > 0 && time >= this.buffExpireAt) {
      this.buffDamage = 0;
    }

    // 自动普攻：锁定目标或范围内最近敌人
    this.attackTarget = this._resolveAttackTarget();
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
    this._triggerPlayerAttackAnim();
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

  /** 指定型：范围内需有敌人；指向型（aoe/heal/buff）可直接施放 */
  _skillRequiresTarget(skill) {
    return skill.range_type === "melee"
      || skill.range_type === "ranged"
      || skill.range_type === "explosion";
  }

  _skillCastRange(skill) {
    if (skill.range_type === "melee") return SKILL_RANGES.melee;
    if (skill.range_type === "ranged" || skill.range_type === "explosion") {
      return SKILL_RANGES.ranged;
    }
    return 0;
  }

  _resolveSkillTarget(skill) {
    const range = this._skillCastRange(skill);
    const locked = this.attackTarget?.alive ? this.attackTarget : null;
    if (locked) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, locked.sprite.x, locked.sprite.y
      );
      if (d <= range) return locked;
    }
    return this._nearestEnemyInRange(range);
  }

  _castSkill(skill, time) {
    if (time < (skill.nextReadyAt || 0)) return; // CD 中
    if (this.playerResource < skill.resource_cost) {
      this._floatText(this.player.x, this.player.y - 10, "资源不足", "#ff6b6b");
      return;
    }

    let target = null;
    if (this._skillRequiresTarget(skill)) {
      target = this._resolveSkillTarget(skill);
      if (!target) {
        this._floatText(this.player.x, this.player.y - 10, "无目标", "#9a9088");
        return;
      }
    }

    // 校验通过后再消耗 CD 与资源
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
      this._castExplosion(skill, target);
    } else if (skill.range_type === "ranged") {
      this._castRanged(skill, target);
    } else {
      this._castMelee(skill, target);
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

  _castRanged(skill, target) {
    const { damage, crit } = skillHitDamage(this.character.stats, skill, this.buffDamage);
    target.takeDamage(damage);
    this._floatText(target.sprite.x, target.sprite.y - 10,
      crit ? `${damage}!` : `${damage}`, crit ? "#ffd54a" : "#4a90e2", crit);
    this._projectileFx(this.player.x, this.player.y, target.sprite.x, target.sprite.y);
  }

  /** 投射命中点爆炸：一次 roll 伤害，爆炸范围内所有敌人受到相同数值 */
  _castExplosion(skill, target) {
    const blastRange = SKILL_RANGES.explosion;
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

  _castMelee(skill, target) {
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
    if (enemy.isBoss && this.riftPhase === "boss") {
      this.killLog.push({ is_boss: true, is_elite: false });
      if (this.cleared) return;
      this.cleared = true;
      this._banner("首领击败！正在结算奖励…", 1400);
      this.time.delayedCall(900, () => this._clearFloor());
      return;
    }

    if (this.riftPhase !== "explore") return;

    this.killLog.push({ is_boss: enemy.isBoss, is_elite: enemy.isElite });
    this.killProgress += 1;
    this._syncRiftHud();

    if (this.killProgress >= this.killQuota) {
      this._onKillQuotaComplete();
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
    lines.push(`✓ 秘境通关 · 第 ${this.currentFloor} 层`);
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
    if (result.auto_sold?.length) {
      lines.push("─── 自动出售 ───");
      const soldGold = result.auto_sold.reduce((s, d) => s + (d.gold || 0), 0);
      result.auto_sold.slice(0, 3).forEach(d => lines.push(`${d.summary}  +${d.gold}金`));
      if (result.auto_sold.length > 3) lines.push(`… 等共 ${result.auto_sold.length} 件，+${soldGold}金`);
      else if (result.auto_sold.length > 1) lines.push(`合计 +${soldGold}金`);
    }
    if (result.auto_dismantled?.length) {
      lines.push("─── 自动分解 ───");
      result.auto_dismantled.slice(0, 3).forEach(d =>
        lines.push(`${d.summary}  →${d.qty}×${d.tier}`)
      );
      if (result.auto_dismantled.length > 3)
        lines.push(`… 等共 ${result.auto_dismantled.length} 件`);
    }
    if (result.inventory_over_limit)
      lines.push(`⚠ 背包超载 ${result.inventory_count}/${result.inventory_max}，回城后需清理才能再进本`);

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
    this.killLog = [];
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
    const sub = this.add.text(px + W / 2, py + 62,
      `秘境失败 · 第 ${this.currentFloor ?? "?"} 层\n本轮奖励已全部失去`, {
      fontFamily: FONT, fontSize: "14px", color: "#a09090", align: "center",
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
