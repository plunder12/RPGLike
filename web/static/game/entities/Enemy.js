// Enemy：怪物实体 — 优先使用史莱姆 spritesheet。

import { ENEMY_SCALE } from "../constants.js";
import { findPathWorld } from "../systems/pathfinding.js";

const AGGRO_RANGE = 280;
const ATTACK_RANGE = 40;
const DEFAULT_SPEED = 95;
const PATH_RECALC_MS = 450;
const WAYPOINT_REACH = 10;
const SLIME_KEY = "enemy_slime";

function slimeAvailable(scene) {
  return scene.textures.exists(SLIME_KEY)
    && scene.textures.get(SLIME_KEY).frameTotal > 0;
}

export default class Enemy {
  constructor(scene, x, y, data) {
    this.scene = scene;
    this.data = data;
    this.maxHp = data.max_hp;
    this.hp = data.hp;
    this.attack = data.attack;
    this.defense = data.defense;
    this.isBoss = data.is_boss;
    this.isElite = data.is_elite;
    this.alive = true;
    this.dying = false;
    this.attacking = false;

    this.useSlime = slimeAvailable(scene);
    this.texKey = this.useSlime
      ? SLIME_KEY
      : (data.is_boss ? "enemy_boss" : data.is_elite ? "enemy_elite" : "enemy_normal");
    this.animated = this.useSlime;

    this.speed = data.is_boss ? 105 : data.is_elite ? 115 : DEFAULT_SPEED;
    this.attackCooldown = data.is_boss ? 1100 : 850;
    this.nextAttackAt = 0;

    if (this.animated) {
      this.sprite = scene.physics.add.sprite(x, y, SLIME_KEY, 0);
      let scale = ENEMY_SCALE;
      if (this.isBoss) scale *= 1.35;
      else if (this.isElite) scale *= 1.12;
      this.sprite.setScale(scale);
      if (this.isBoss) this.sprite.setTint(0xff8866);
      else if (this.isElite) this.sprite.setTint(0xcc99ff);
      this._playAnim("idle", true);
    } else {
      this.sprite = scene.physics.add.image(x, y, this.texKey);
      if (this.isBoss) this.sprite.setScale(1.15);
      else if (this.isElite) this.sprite.setScale(1.08);
    }

    this.sprite.setDepth(18);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.owner = this;

    this.speedDebuff = 0;
    this.debuffExpireAt = 0;

    this.path = [];
    this.pathIndex = 0;
    this.nextPathAt = 0;

    this._buildHpBar();
    this._buildLabel();
  }

  _playAnim(state, force = false) {
    if (!this.animated || this.dying) return;
    const key = `${SLIME_KEY}_${state}`;
    if (!this.scene.anims.exists(key)) return;
    if (!force && this.attacking && state !== "attack") return;
    if (this.sprite.anims?.currentAnim?.key === key && state !== "attack") return;
    this.sprite.play(key, true);
  }

  _triggerAttackAnim() {
    if (!this.animated) return;
    const key = `${SLIME_KEY}_attack`;
    if (!this.scene.anims.exists(key)) return;
    this.attacking = true;
    this.sprite.play(key);
    this.sprite.once(`animationcomplete-${key}`, () => {
      this.attacking = false;
    });
  }

  _buildHpBar() {
    const w = this.isBoss ? 48 : 30;
    this.barW = w;
    this.barBg = this.scene.add
      .rectangle(this.sprite.x, this.sprite.y, w, 5, 0x000000, 0.7)
      .setOrigin(0.5)
      .setDepth(900);
    this.barFill = this.scene.add
      .rectangle(this.sprite.x, this.sprite.y, w, 5, 0xd9534f, 1)
      .setOrigin(0.5)
      .setDepth(901);
  }

  _buildLabel() {
    if (!this.isBoss && !this.isElite) return;
    const color = this.isBoss ? "#ff7a5a" : "#c98ad0";
    this.label = this.scene.add
      .text(this.sprite.x, this.sprite.y, this.isBoss ? "BOSS" : "精英", {
        fontFamily: "Microsoft YaHei, sans-serif",
        fontSize: "11px",
        color,
      })
      .setOrigin(0.5)
      .setDepth(902);
  }

  update(time, player) {
    if (!this.alive || this.dying) return;
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x, this.sprite.y, player.x, player.y
    );

    if (this.speedDebuff > 0 && time >= this.debuffExpireAt) {
      this.speedDebuff = 0;
      if (this.useSlime) {
        if (this.isBoss) this.sprite.setTint(0xff8866);
        else if (this.isElite) this.sprite.setTint(0xcc99ff);
        else this.sprite.clearTint();
      } else {
        this.sprite.clearTint();
      }
    }

    const effectiveSpeed = this.speed * (1 - this.speedDebuff);
    let moving = false;

    if (dist <= ATTACK_RANGE) {
      this.sprite.body.setVelocity(0, 0);
      this.path = [];
      this.pathIndex = 0;
      if (time >= this.nextAttackAt) {
        this.nextAttackAt = time + this.attackCooldown;
        this._triggerAttackAnim();
        this.scene.onEnemyAttack(this);
      }
      this._playAnim("idle");
    } else if (dist <= AGGRO_RANGE) {
      moving = this._chaseWithPath(time, player, effectiveSpeed);
      if (!moving) this._playAnim("idle");
    } else {
      this.sprite.body.setVelocity(0, 0);
      this.path = [];
      this.pathIndex = 0;
      this._playAnim("idle");
    }

    if (moving) {
      const vx = this.sprite.body.velocity.x;
      if (vx !== 0) this.sprite.setFlipX(vx < 0);
      this._playAnim("walk");
    }

    this._syncOverlay();
  }

  _chaseWithPath(time, player, speed) {
    if (time >= this.nextPathAt || this.pathIndex >= this.path.length) {
      this.path = findPathWorld(
        this.sprite.x, this.sprite.y, player.x, player.y
      );
      this.pathIndex = 0;
      this.nextPathAt = time + PATH_RECALC_MS;
    }

    if (this.path.length === 0) {
      this.scene.physics.moveToObject(this.sprite, player, speed);
      return this.sprite.body.velocity.x !== 0 || this.sprite.body.velocity.y !== 0;
    }

    const wp = this.path[this.pathIndex];
    const dx = wp.x - this.sprite.x;
    const dy = wp.y - this.sprite.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d < WAYPOINT_REACH) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.sprite.body.setVelocity(0, 0);
        return false;
      }
      const next = this.path[this.pathIndex];
      const ndx = next.x - this.sprite.x;
      const ndy = next.y - this.sprite.y;
      const nd = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
      this.sprite.body.setVelocity((ndx / nd) * speed, (ndy / nd) * speed);
    } else {
      this.sprite.body.setVelocity((dx / d) * speed, (dy / d) * speed);
    }
    return true;
  }

  _syncOverlay() {
    const offY = this.sprite.displayHeight / 2 + 8;
    this.barBg.setPosition(this.sprite.x, this.sprite.y - offY);
    this.barFill.setPosition(
      this.sprite.x - this.barW / 2,
      this.sprite.y - offY
    );
    this.barFill.setOrigin(0, 0.5);
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.barFill.width = this.barW * ratio;
    if (this.label) {
      this.label.setPosition(this.sprite.x, this.sprite.y - offY - 12);
    }
  }

  takeDamage(amount) {
    if (!this.alive || this.dying) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (!this.sprite?.active) return;
      this.sprite.clearTint();
      if (this.useSlime) {
        if (this.isBoss) this.sprite.setTint(0xff8866);
        else if (this.isElite) this.sprite.setTint(0xcc99ff);
      }
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dying) return;
    this.alive = false;
    this.dying = true;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.body.enable = false;
    this.barBg.destroy();
    this.barFill.destroy();
    if (this.label) this.label.destroy();

    const deathKey = `${SLIME_KEY}_death`;
    if (this.animated && this.scene.anims.exists(deathKey)) {
      this.sprite.clearTint();
      this.sprite.play(deathKey);
      this.sprite.once(`animationcomplete-${deathKey}`, () => {
        this.sprite.destroy();
        this.scene.onEnemyDeath(this);
      });
      return;
    }

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 0.3,
      duration: 220,
      onComplete: () => {
        this.sprite.destroy();
        this.scene.onEnemyDeath(this);
      },
    });
  }

  /** 进度满清场：不计入击杀、不触发死亡回调 */
  forceDespawn() {
    if (!this.alive || this.dying) return;
    this.alive = false;
    this.sprite.body?.setVelocity(0, 0);
    if (this.sprite.body) this.sprite.body.enable = false;
    this.barBg?.destroy();
    this.barFill?.destroy();
    if (this.label) this.label.destroy();
    this.sprite.destroy();
  }
}
