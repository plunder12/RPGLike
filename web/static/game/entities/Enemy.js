// Enemy：怪物实体（占位图形）。
// 封装精灵 + 头顶血条 + 简单 AI（待机 → 发现玩家追击 → 近身攻击）。
// 攻击玩家通过 scene.onEnemyAttack(enemy) 回调，由 DungeonScene 结算伤害。

import { TILE } from "../constants.js";

const AGGRO_RANGE = 280;   // 发现玩家的距离
const ATTACK_RANGE = 40;   // 近身攻击距离
const DEFAULT_SPEED = 95;

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

    const tex = data.is_boss ? "enemy_boss" : data.is_elite ? "enemy_elite" : "enemy_normal";
    this.speed = data.is_boss ? 105 : data.is_elite ? 115 : DEFAULT_SPEED;
    this.attackCooldown = data.is_boss ? 1100 : 850;
    this.nextAttackAt = 0;

    this.sprite = scene.physics.add.image(x, y, tex);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.owner = this;

    this.speedDebuff = 0;      // 减速比例（0~1），来自冰霜新星等控制技能
    this.debuffExpireAt = 0;

    this._buildHpBar();
    this._buildLabel();
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
    if (!this.alive) return;
    const dist = Phaser.Math.Distance.Between(
      this.sprite.x,
      this.sprite.y,
      player.x,
      player.y
    );

    // 减速 debuff 到期则清除，同时恢复颜色。
    if (this.speedDebuff > 0 && time >= this.debuffExpireAt) {
      this.speedDebuff = 0;
      this.sprite.clearTint();
    }

    const effectiveSpeed = this.speed * (1 - this.speedDebuff);

    if (dist <= ATTACK_RANGE) {
      this.sprite.body.setVelocity(0, 0);
      if (time >= this.nextAttackAt) {
        this.nextAttackAt = time + this.attackCooldown;
        this.scene.onEnemyAttack(this);
      }
    } else if (dist <= AGGRO_RANGE) {
      this.scene.physics.moveToObject(this.sprite, player, effectiveSpeed);
    } else {
      this.sprite.body.setVelocity(0, 0);
    }

    this._syncOverlay();
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
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    // 受击闪白。
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      if (this.sprite && this.sprite.active) this.sprite.clearTint();
    });
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.body.enable = false;
    this.barBg.destroy();
    this.barFill.destroy();
    if (this.label) this.label.destroy();
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 0.3,
      duration: 220,
      onComplete: () => this.sprite.destroy(),
    });
    this.scene.onEnemyDeath(this);
  }
}
