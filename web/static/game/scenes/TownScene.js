/**
 * TownScene — 城镇场景：背包 / 技能 / 锻造 + 进入地牢
 *
 * 接收 data: { character }
 * 所有面板通过 Phaser 的 Graphics + Text 绘制，分页展示。
 */
import { Api } from "../systems/apiClient.js";

const FONT = "Microsoft YaHei, sans-serif";
const C = {
  bg: 0x0f0e12,
  panel: 0x1a1820,
  header: 0x12101a,
  border: 0x3a3550,
  gold: 0xc9a227,
  text: 0xe8e0d5,
  dim: 0x7a7080,
  red: 0xd04040,
  blue: 0x4080d0,
  green: 0x40a060,
  purple: 0xb060d0,
  orange: 0xd08030,
  normal: 0x909090,
  magic: 0x5080d8,
  rare: 0xd0c030,
  unique: 0xd06020,
  legendary: 0xd02060,
};

const RARITY_COLOR = {
  普通: "#909090",
  魔法: "#5080d8",
  稀有: "#d0c030",
  传奇: "#d02060",
  遗物: "#ff8000",
};
const RARITY_BG = {
  普通: 0x1e1e24,
  魔法: 0x141828,
  稀有: 0x1e1c10,
  传奇: 0x1e0e14,
  遗物: 0x1e1208,
};

export default class TownScene extends Phaser.Scene {
  constructor() {
    super({ key: "TownScene" });
  }

  init(data) {
    this.character = data.character || {};
    this.activeTab = "bag"; // bag | skills | forge | status
    this.page = 0;
    this.PAGE_SIZE = 9;
    this._items = []; // 当前页的 interactive 对象，切换标签时销毁重建
    this._skillData = null;
    this._selectedInvIdx = -1; // 背包中选中的 index
    this._toast = null;
    this._toastTimer = null;
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W;
    this.H = H;

    // ── 整体背景 ──────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, C.bg);

    // ── 头部（统一走 _refreshHeader，避免重叠）──
    this._headerObjs = [];
    this._refreshHeader();

    // ── 标签栏 ────────────────────────────────
    this._buildTabs();

    // ── 底部：进入地牢按钮 ─────────────────────
    this._buildFooter();

    // ── 内容区 ────────────────────────────────
    this._renderTab();

    // 回城后自动满血满资源（异步，完成后刷新头部）
    this._doRest();
  }

  async _doRest() {
    try {
      const c = await Api.rest(this.character.name);
      this.character = c;
      this._refreshHeader();
      // 同步底部层数
      this._targetFloor = c.floor;
      this._floorLabel?.setText(`目标层：第 ${c.floor} 层`);
    } catch {
      // 静默失败，不影响正常使用
    }
  }

  // ────────────────────────────────────────────────────────────
  // Header
  // ────────────────────────────────────────────────────────────
  // 从 character 对象中读取 HP，兼容 stats.hp 和顶层 hp
  _getHp(c) {
    return c.stats?.hp ?? c.hp ?? c.stats?.max_hp ?? 0;
  }
  _getMaxHp(c) {
    return c.stats?.max_hp ?? c.max_hp ?? 0;
  }

  // ────────────────────────────────────────────────────────────
  // Tabs
  // ────────────────────────────────────────────────────────────
  _buildTabs() {
    const tabs = [
      { key: "bag", label: "背包" },
      { key: "skills", label: "技能" },
      { key: "forge", label: "锻造" },
      { key: "status", label: "状态" },
    ];
    const W = this.W;
    const tabW = 120, tabH = 34, startY = 80;

    this._tabObjs = {};
    tabs.forEach((t, i) => {
      const x = 20 + i * (tabW + 8);
      const isActive = t.key === this.activeTab;
      const bg = this.add.rectangle(x, startY, tabW, tabH, isActive ? C.gold : C.panel)
        .setOrigin(0, 0).setDepth(2);
      const label = this.add.text(x + tabW / 2, startY + tabH / 2, t.label, {
        fontFamily: FONT, fontSize: "14px",
        color: isActive ? "#0f0e12" : "#c0b0e0",
      }).setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true });

      label.on("pointerdown", () => this._switchTab(t.key));
      label.on("pointerover", () => {
        if (t.key !== this.activeTab)
          bg.setFillStyle(0x2a2540);
      });
      label.on("pointerout", () => {
        if (t.key !== this.activeTab)
          bg.setFillStyle(C.panel);
      });

      this._tabObjs[t.key] = { bg, label };
    });

    // 分隔线
    this.add.rectangle(W / 2, 114, W, 2, C.border).setDepth(2);
  }

  _switchTab(key) {
    if (key === this.activeTab) return;

    // 更新 tab 外观
    Object.entries(this._tabObjs).forEach(([k, { bg, label }]) => {
      if (k === key) {
        bg.setFillStyle(C.gold);
        label.setStyle({ color: "#0f0e12" });
      } else {
        bg.setFillStyle(C.panel);
        label.setStyle({ color: "#c0b0e0" });
      }
    });

    this.activeTab = key;
    this.page = 0;
    this._selectedInvIdx = -1;
    this._clearContent();
    this._renderTab();
  }

  // ────────────────────────────────────────────────────────────
  // Footer
  // ────────────────────────────────────────────────────────────
  _buildFooter() {
    const W = this.W, H = this.H;
    const c = this.character;

    this.add.rectangle(W / 2, H - 36, W, 72, C.header).setDepth(1);
    this.add.rectangle(W / 2, H - 72, W, 2, C.border).setDepth(2);

    // 层数输入提示（用 Phaser Text 展示当前选层）
    this._floorLabel = this.add.text(W / 2, H - 50, `目标层：第 ${c.floor} 层`, {
      fontFamily: FONT, fontSize: "14px", color: "#a090c0",
    }).setOrigin(0.5, 0).setDepth(3);

    // -/+ 按钮
    const btnStyle = { fontFamily: FONT, fontSize: "18px", color: "#c9a227",
      backgroundColor: "#2a2540", padding: { x: 12, y: 6 } };
    this._targetFloor = c.floor;

    this.add.text(W / 2 - 100, H - 52, "◀", btnStyle)
      .setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this._changeTargetFloor(-1));
    this.add.text(W / 2 + 100, H - 52, "▶", btnStyle)
      .setOrigin(0.5).setDepth(3).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this._changeTargetFloor(1));

    // 进入地牢按钮
    const enterBtn = this.add.text(W - 24, H - 36, "⚔ 进入地牢", {
      fontFamily: FONT, fontSize: "16px", color: "#0f0e12",
      backgroundColor: "#c9a227", padding: { x: 20, y: 10 },
    }).setOrigin(1, 0.5).setDepth(3).setInteractive({ useHandCursor: true });

    enterBtn.on("pointerover", () => enterBtn.setStyle({ backgroundColor: "#e8c040" }));
    enterBtn.on("pointerout", () => enterBtn.setStyle({ backgroundColor: "#c9a227" }));
    enterBtn.on("pointerdown", () => this._enterDungeon());

    // 返回主菜单
    this.add.text(20, H - 36, "← 主菜单", {
      fontFamily: FONT, fontSize: "13px", color: "#6a6080",
    }).setOrigin(0, 0.5).setDepth(3).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("TitleScene"));
  }

  _changeTargetFloor(delta) {
    const max = (this.character.highest_floor ?? 0) + 1;
    this._targetFloor = Math.max(1, Math.min(max, this._targetFloor + delta));
    this._floorLabel.setText(`目标层：第 ${this._targetFloor} 层`);
  }

  _enterDungeon() {
    this._clearContent();
    this.scene.start("DungeonScene", {
      character: this.character,
      targetFloor: this._targetFloor,
    });
  }

  // ────────────────────────────────────────────────────────────
  // Content area management
  // ────────────────────────────────────────────────────────────
  _clearContent() {
    this._items.forEach(o => o.destroy?.());
    this._items = [];
  }

  _renderTab() {
    if (this.activeTab === "bag") this._renderBag();
    else if (this.activeTab === "skills") this._renderSkills();
    else if (this.activeTab === "forge") this._renderForge();
    else if (this.activeTab === "status") this._renderStatus();
  }

  // ────────────────────────────────────────────────────────────
  // Tab: 背包
  // ────────────────────────────────────────────────────────────
  _renderBag() {
    const W = this.W;
    const CONTENT_Y = 120;
    const CONTENT_H = this.H - 72 - CONTENT_Y;

    // ── 左侧：已装备栏 ──────────
    const eqW = 220;
    this._drawEquipped(8, CONTENT_Y, eqW, CONTENT_H);

    // ── 右侧：背包列表 ──────────
    const listX = eqW + 20;
    const listW = W - listX - 8;
    this._drawInventory(listX, CONTENT_Y, listW, CONTENT_H);
  }

  // ── 解析 summary 字符串 "[color·rarity]name(slot) affix1 | affix2" ──
  _parseSummary(summary) {
    if (!summary) return { name: "?", affixStr: "" };
    // 格式: "[金色·稀有]战刃(武器) 攻击+15 | 暴击率+8.3%"
    const m = summary.match(/^\[[^\]]+\](.+?)\([^)]+\)\s*(.*)/);
    if (!m) return { name: summary, affixStr: "" };
    return { name: m[1].trim(), affixStr: m[2].trim() };
  }

  // 从 summary 字符串 "[...·稀有]..." 提取颜色
  _colorFromSummary(summary) {
    const m = summary?.match(/\[([^\]]+)\]/);
    if (!m) return "#c0c0c0";
    const s = m[1];
    if (s.includes("传奇")) return RARITY_COLOR["传奇"];
    if (s.includes("稀有")) return RARITY_COLOR["稀有"];
    if (s.includes("魔法")) return RARITY_COLOR["魔法"];
    return RARITY_COLOR["普通"];
  }

  // compare_tag → 颜色 + 展示文字
  _compareStyle(tag) {
    if (!tag || tag === "[新部位]") return { text: "新部位", color: "#60a0e0" };
    if (tag.includes("↑")) return { text: "↑ 提升", color: "#40d070" };
    if (tag.includes("↓")) return { text: "↓ 降低", color: "#d04040" };
    return { text: "≈ 相近", color: "#c0c040" };
  }

  _drawEquipped(x, y, w, h) {
    const eq = this.character.equipment ?? {};
    const SLOTS = [
      ["weapon", "武器"], ["helm", "头盔"], ["chest", "护甲"],
      ["gloves", "手套"], ["boots", "鞋子"], ["ring", "戒指"],
    ];
    const rowH = 62;
    const bg = this.add.rectangle(x, y, w, h, C.panel).setOrigin(0, 0).setDepth(2);
    this._items.push(bg);
    const title = this.add.text(x + 8, y + 5, "已装备", {
      fontFamily: FONT, fontSize: "13px", color: "#c9a227",
    }).setDepth(3);
    this._items.push(title);

    SLOTS.forEach(([slot, label], i) => {
      const slotData = eq[slot];
      const item = slotData?.item ?? null;
      const forgeLv = slotData?.forge_level ?? 0;
      const ry = y + 26 + i * rowH;

      // 分隔线
      const line = this.add.rectangle(x + 4, ry, w - 8, 1, 0x2a2840).setOrigin(0, 0).setDepth(2);
      this._items.push(line);

      const slotLbl = this.add.text(x + 8, ry + 4, label, {
        fontFamily: FONT, fontSize: "11px", color: "#706880",
      }).setDepth(3);
      this._items.push(slotLbl);

      if (!item) {
        const empty = this.add.text(x + 50, ry + 20, "（空）", {
          fontFamily: FONT, fontSize: "12px", color: "#303040",
        }).setDepth(3);
        this._items.push(empty);
        return;
      }

      const col = this._colorFromSummary(item.summary);
      const { name, affixStr } = this._parseSummary(item.summary);
      const dispName = forgeLv > 0 ? `${name}  +${forgeLv}` : name;

      const nm = this.add.text(x + 50, ry + 4, dispName, {
        fontFamily: FONT, fontSize: "12px", color: col,
      }).setDepth(3);
      this._items.push(nm);

      // 属性行（按 | 分割，最多两行）
      if (affixStr) {
        const parts = affixStr.split(" | ");
        // 每行最多2个，最多2行 = 4个
        const line1 = parts.slice(0, 2).join("  ");
        const line2 = parts.slice(2, 4).join("  ");
        const affLbl1 = this.add.text(x + 50, ry + 22, line1, {
          fontFamily: FONT, fontSize: "11px", color: "#8090a0",
        }).setDepth(3);
        this._items.push(affLbl1);
        if (line2) {
          const affLbl2 = this.add.text(x + 50, ry + 36, line2, {
            fontFamily: FONT, fontSize: "11px", color: "#8090a0",
          }).setDepth(3);
          this._items.push(affLbl2);
        }
      }
    });
  }

  _drawInventory(x, y, w, h) {
    const inv = this.character.inventory ?? [];
    const total = inv.length;
    const PAGE_SIZE = 7; // 行高变大，每页少一点
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(this.page, pageCount - 1);
    const startIdx = page * PAGE_SIZE;
    const pageItems = inv.slice(startIdx, startIdx + PAGE_SIZE);

    // 标题
    const title = this.add.text(x, y + 6, `背包  ${total}/50`, {
      fontFamily: FONT, fontSize: "13px", color: "#c9a227",
    }).setDepth(3);
    this._items.push(title);

    // 批量按钮
    const sellAll = this.add.text(x + w - 8, y + 6, "全售", {
      fontFamily: FONT, fontSize: "12px", color: "#d04040",
      backgroundColor: "#2a1818", padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setDepth(3).setInteractive({ useHandCursor: true });
    sellAll.on("pointerdown", () => this._doSellAll());
    this._items.push(sellAll);

    const discAll = this.add.text(x + w - 52, y + 6, "全解", {
      fontFamily: FONT, fontSize: "12px", color: "#a040d0",
      backgroundColor: "#1a1828", padding: { x: 6, y: 2 },
    }).setOrigin(1, 0).setDepth(3).setInteractive({ useHandCursor: true });
    discAll.on("pointerdown", () => this._doDiscardAll());
    this._items.push(discAll);

    if (total === 0) {
      const empty = this.add.text(x + w / 2, y + h / 2, "背包空空如也", {
        fontFamily: FONT, fontSize: "14px", color: "#404050",
      }).setOrigin(0.5).setDepth(3);
      this._items.push(empty);
      return;
    }

    const rowH = 56;
    pageItems.forEach((item, i) => {
      const invIdx = startIdx + i;
      const ry = y + 28 + i * rowH;
      const col = RARITY_COLOR[item.rarity] ?? "#c0c0c0";
      const bgC = RARITY_BG[item.rarity] ?? 0x1a1a24;

      const rowBg = this.add.rectangle(x, ry, w - 2, rowH - 2, bgC).setOrigin(0, 0).setDepth(2);
      this._items.push(rowBg);

      // 对比标签（左上角小徽章）
      const cmpStyle = this._compareStyle(item.compare);
      const cmpBadge = this.add.text(x + 4, ry + 3, cmpStyle.text, {
        fontFamily: FONT, fontSize: "10px", color: cmpStyle.color,
        backgroundColor: "#1a1820", padding: { x: 3, y: 1 },
      }).setDepth(4);
      this._items.push(cmpBadge);

      // 物品名称（稀有度颜色）
      const { name, affixStr } = this._parseSummary(item.summary);
      const nm = this.add.text(x + 4, ry + 18, name, {
        fontFamily: FONT, fontSize: "13px", color: col,
      }).setDepth(3);
      this._items.push(nm);

      // 属性行（按 | 分割，最多两列）
      if (affixStr) {
        const parts = affixStr.split(" | ");
        const maxW = w - 160; // 留出右侧按钮位置
        const affTxt = parts.slice(0, 4).join("  ·  ");
        const affLbl = this.add.text(x + 4, ry + 36, affTxt, {
          fontFamily: FONT, fontSize: "11px", color: "#8090a0",
          wordWrap: { width: maxW },
        }).setDepth(3);
        this._items.push(affLbl);
      }

      // 售价/分解提示（极小字）
      const priceStr = item.sell_gold ? `售${item.sell_gold}金` : "";
      if (priceStr) {
        const priceLbl = this.add.text(x + 4, ry + rowH - 10, priceStr, {
          fontFamily: FONT, fontSize: "10px", color: "#504060",
        }).setDepth(3);
        this._items.push(priceLbl);
      }

      // 操作按钮（右侧竖排）
      const btnX = x + w - 6;
      const mkBtn = (label, by, color, bg, cb) => {
        const b = this.add.text(btnX, ry + by, label, {
          fontFamily: FONT, fontSize: "11px", color,
          backgroundColor: bg, padding: { x: 5, y: 3 },
        }).setOrigin(1, 0).setDepth(4).setInteractive({ useHandCursor: true });
        b.on("pointerover", () => b.setAlpha(0.75));
        b.on("pointerout", () => b.setAlpha(1));
        b.on("pointerdown", cb);
        return b;
      };

      this._items.push(mkBtn("装备", 3, "#40d080", "#0e1a12", () => this._doEquip(invIdx)));
      this._items.push(mkBtn("售卖", 22, "#d04040", "#1a0f0f", () => this._doSell(invIdx)));
      this._items.push(mkBtn("分解", 41, "#a040d0", "#120f1a", () => this._doDismantle(invIdx)));
    });

    this._drawPageControls(x, y + h - 28, w, pageCount, page);
  }

  // ────────────────────────────────────────────────────────────
  // Tab: 技能
  // ────────────────────────────────────────────────────────────
  async _renderSkills() {
    const W = this.W;
    const CONTENT_Y = 120;
    if (!this._skillData) {
      const loading = this.add.text(W / 2, 300, "加载技能中…", {
        fontFamily: FONT, fontSize: "14px", color: "#a090c0",
      }).setOrigin(0.5).setDepth(3);
      this._items.push(loading);
      try {
        this._skillData = await Api.getSkills(this.character.name);
        // 刷新服务端返回的角色数据（技能点可能变了）
        this.character = await Api.getCharacter(this.character.name);
        this._clearContent();
        this._renderSkills();
      } catch (e) {
        loading.setText(`加载失败：${e.message}`);
      }
      return;
    }

    // API 直接返回技能数组（不是对象）
    const skills = Array.isArray(this._skillData) ? this._skillData : (this._skillData?.skills ?? []);
    const W2 = W - 40;
    const points = this.character.skill_points ?? 0;

    // 技能点展示
    const ptTxt = this.add.text(20, CONTENT_Y + 6, `可用技能点：${points}`, {
      fontFamily: FONT, fontSize: "14px", color: "#c9a227",
    }).setDepth(3);
    this._items.push(ptTxt);

    const resetBtn = this.add.text(W - 20, CONTENT_Y + 6, "重置技能", {
      fontFamily: FONT, fontSize: "13px", color: "#d04040",
      backgroundColor: "#1a0f0f", padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(3).setInteractive({ useHandCursor: true });
    resetBtn.on("pointerdown", () => this._doResetSkills());
    this._items.push(resetBtn);

    if (skills.length === 0) {
      const empty = this.add.text(W / 2, 300, "暂无可学技能", {
        fontFamily: FONT, fontSize: "14px", color: "#404050",
      }).setOrigin(0.5).setDepth(3);
      this._items.push(empty);
      return;
    }

    const total = skills.length;
    const pageCount = Math.max(1, Math.ceil(total / this.PAGE_SIZE));
    const page = Math.min(this.page, pageCount - 1);
    const pageSkills = skills.slice(page * this.PAGE_SIZE, (page + 1) * this.PAGE_SIZE);

    const rowH = 52;
    pageSkills.forEach((sk, i) => {
      const ry = CONTENT_Y + 34 + i * rowH;
      // API 字段：rank=当前等级, max_rank=最大等级, id=技能ID, desc=描述
      const curLv = sk.rank ?? sk.current_level ?? 0;
      const maxLv = sk.max_rank ?? sk.max_level ?? 1;
      const skillId = sk.id ?? sk.skill_id;
      const learned = curLv > 0;
      const bgC = learned ? 0x121828 : 0x141214;

      const rowBg = this.add.rectangle(20, ry, W2, rowH - 2, bgC).setOrigin(0, 0).setDepth(2);
      this._items.push(rowBg);

      const nameCol = learned ? "#80c0ff" : "#808090";
      const nm = this.add.text(28, ry + 6, `${sk.name}  Lv${curLv}/${maxLv}`, {
        fontFamily: FONT, fontSize: "14px", color: nameCol,
      }).setDepth(3);
      this._items.push(nm);

      const descStr = (sk.desc ?? sk.description ?? "").slice(0, 60);
      const desc = this.add.text(28, ry + 28, descStr, {
        fontFamily: FONT, fontSize: "11px", color: "#706880",
      }).setDepth(3);
      this._items.push(desc);

      // 学习按钮
      if (curLv < maxLv && points > 0) {
        const learnBtn = this.add.text(W - 24, ry + rowH / 2 - 2, `学习 (${sk.cost ?? 1}点)`, {
          fontFamily: FONT, fontSize: "12px", color: "#40a060",
          backgroundColor: "#0f1a14", padding: { x: 6, y: 3 },
        }).setOrigin(1, 0.5).setDepth(4).setInteractive({ useHandCursor: true });
        learnBtn.on("pointerdown", () => this._doLearnSkill(skillId));
        this._items.push(learnBtn);
      }
    });

    this._drawPageControls(20, CONTENT_Y + 34 + this.PAGE_SIZE * rowH + 4, W - 20, pageCount, page);
  }

  // ────────────────────────────────────────────────────────────
  // Tab: 锻造
  // ────────────────────────────────────────────────────────────
  _renderForge() {
    const W = this.W;
    const CONTENT_Y = 120;
    // API 返回 forge_slots 数组：[{slot, slot_name, level, cost, desc}]
    const forgeSlots = this.character.forge_slots ?? [];
    const eq = this.character.equipment ?? {};

    const title = this.add.text(20, CONTENT_Y + 8, "锻造强化（消耗材料提升已装备装备属性）", {
      fontFamily: FONT, fontSize: "13px", color: "#a090c0",
    }).setDepth(3);
    this._items.push(title);

    const rowH = 58;
    forgeSlots.forEach((fs, i) => {
      const ry = CONTENT_Y + 34 + i * rowH;
      const slotData = eq[fs.slot];
      const item = slotData?.item ?? null;

      const rowBg = this.add.rectangle(20, ry, W - 40, rowH - 2, C.panel).setOrigin(0, 0).setDepth(2);
      this._items.push(rowBg);

      const slotLbl = this.add.text(28, ry + 7, fs.slot_name, {
        fontFamily: FONT, fontSize: "12px", color: "#706880",
      }).setDepth(3);
      this._items.push(slotLbl);

      if (!item) {
        const empty = this.add.text(95, ry + 16, "（未装备）", {
          fontFamily: FONT, fontSize: "12px", color: "#303040",
        }).setDepth(3);
        this._items.push(empty);
        return;
      }

      const col = this._colorFromSummary(item.summary);
      const { name: iName, affixStr: iAffixes } = this._parseSummary(item.summary);
      const nm = this.add.text(95, ry + 5, fs.level > 0 ? `${iName}  +${fs.level}` : iName, {
        fontFamily: FONT, fontSize: "12px", color: col,
      }).setDepth(3);
      this._items.push(nm);

      // 属性一览（第一行）
      if (iAffixes) {
        const affLbl = this.add.text(95, ry + 22, iAffixes, {
          fontFamily: FONT, fontSize: "10px", color: "#7080a0",
          wordWrap: { width: W - 260 },
        }).setDepth(3);
        this._items.push(affLbl);
      }
      // 锻造等级 + 费用（第二行，完整显示，不与按钮重叠）
      const costColor = fs.cost === "已满级" ? "#c9a227" : "#a0a0a0";
      const lvCostTxt = this.add.text(95, ry + 36, `锻 +${fs.level}  ${fs.desc}  |  费用：${fs.cost}`, {
        fontFamily: FONT, fontSize: "10px", color: costColor,
        wordWrap: { width: W - 160 },
      }).setDepth(3);
      this._items.push(lvCostTxt);

      const forgeBtn = this.add.text(W - 24, ry + rowH / 2 - 2, "锻造", {
        fontFamily: FONT, fontSize: "13px", color: "#c9a227",
        backgroundColor: "#1a1408", padding: { x: 10, y: 5 },
      }).setOrigin(1, 0.5).setDepth(4).setInteractive({ useHandCursor: true });
      forgeBtn.on("pointerover", () => forgeBtn.setStyle({ backgroundColor: "#2a2010" }));
      forgeBtn.on("pointerout", () => forgeBtn.setStyle({ backgroundColor: "#1a1408" }));
      forgeBtn.on("pointerdown", () => this._doForge(fs.slot));
      this._items.push(forgeBtn);
    });
  }

  // ────────────────────────────────────────────────────────────
  // Tab: 状态
  // ────────────────────────────────────────────────────────────
  _renderStatus() {
    const W = this.W;
    const CONTENT_Y = 120;
    const c = this.character;
    const stats = c.stats ?? {};

    const colW = (W - 40) / 2;
    const rows = [
      ["最大生命", stats.max_hp ?? this._getMaxHp(c)],
      ["攻击力", stats.attack],
      ["防御力", stats.defense],
      ["技能伤害", `+${Math.round((stats.skill_damage ?? 0) * 100)}%`],
      ["暴击率", `${Math.round((stats.crit_rate ?? 0) * 100)}%`],
      ["暴击伤害", `+${Math.round((stats.crit_damage ?? 0) * 100)}%`],
      ["生命回复", `${stats.hp_regen ?? 0}/s`],
      ["资源回复", `${stats.resource_regen ?? 0}/s`],
      ["移动速度", stats.move_speed ?? 180],
    ];

    rows.forEach(([label, val], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const rx = 20 + col * colW;
      const ry = CONTENT_Y + 20 + row * 44;

      const bg = this.add.rectangle(rx, ry, colW - 8, 40, C.panel).setOrigin(0, 0).setDepth(2);
      this._items.push(bg);

      const lbl = this.add.text(rx + 10, ry + 6, label, {
        fontFamily: FONT, fontSize: "12px", color: "#706880",
      }).setDepth(3);
      this._items.push(lbl);

      const valTxt = this.add.text(rx + colW - 18, ry + 18, String(val ?? 0), {
        fontFamily: FONT, fontSize: "16px", color: "#e8e0d5",
      }).setOrigin(1, 0).setDepth(3);
      this._items.push(valTxt);
    });

    // 技能点
    const ptBg = this.add.rectangle(20, CONTENT_Y + 20 + 5 * 44, W - 40, 40, 0x121828).setOrigin(0, 0).setDepth(2);
    this._items.push(ptBg);
    const ptTxt = this.add.text(30, CONTENT_Y + 22 + 5 * 44, `可用技能点：${c.skill_points ?? 0}`, {
      fontFamily: FONT, fontSize: "14px", color: "#c9a227",
    }).setDepth(3);
    this._items.push(ptTxt);
  }

  // ────────────────────────────────────────────────────────────
  // 分页控件
  // ────────────────────────────────────────────────────────────
  _drawPageControls(x, y, w, pageCount, currentPage) {
    if (pageCount <= 1) return;

    const prev = this.add.text(x + 20, y, "◀ 上页", {
      fontFamily: FONT, fontSize: "13px", color: currentPage > 0 ? "#c9a227" : "#404050",
    }).setDepth(4).setInteractive({ useHandCursor: true });
    if (currentPage > 0) prev.on("pointerdown", () => { this.page--; this._clearContent(); this._renderTab(); });
    this._items.push(prev);

    const info = this.add.text(x + w / 2, y, `${currentPage + 1} / ${pageCount}`, {
      fontFamily: FONT, fontSize: "13px", color: "#a090c0",
    }).setOrigin(0.5, 0).setDepth(4);
    this._items.push(info);

    const next = this.add.text(x + w - 20, y, "下页 ▶", {
      fontFamily: FONT, fontSize: "13px",
      color: currentPage < pageCount - 1 ? "#c9a227" : "#404050",
    }).setOrigin(1, 0).setDepth(4).setInteractive({ useHandCursor: true });
    if (currentPage < pageCount - 1) next.on("pointerdown", () => { this.page++; this._clearContent(); this._renderTab(); });
    this._items.push(next);
  }

  // ────────────────────────────────────────────────────────────
  // API 操作
  // ────────────────────────────────────────────────────────────
  async _doEquip(index) {
    try {
      const r = await Api.equipItem(this.character.name, index);
      this.character = await Api.getCharacter(this.character.name);
      this._toast = this._showToast(r.message ?? "已装备");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`装备失败：${e.message}`, true); }
  }

  async _doSell(index) {
    try {
      const r = await Api.sellItem(this.character.name, index);
      this.character = await Api.getCharacter(this.character.name);
      this._showToast(r.message ?? "已出售");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`出售失败：${e.message}`, true); }
  }

  async _doDismantle(index) {
    try {
      const r = await Api.dismantleItem(this.character.name, index);
      this.character = await Api.getCharacter(this.character.name);
      this._showToast(r.message ?? "已分解");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`分解失败：${e.message}`, true); }
  }

  async _doSellAll() {
    try {
      const r = await Api.sellAll(this.character.name);
      this.character = await Api.getCharacter(this.character.name);
      this._showToast(r.message ?? "全部出售");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`失败：${e.message}`, true); }
  }

  async _doDiscardAll() {
    try {
      const r = await Api.dismantleAll(this.character.name);
      this.character = await Api.getCharacter(this.character.name);
      this._showToast(r.message ?? "全部分解");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`失败：${e.message}`, true); }
  }

  async _doLearnSkill(skillId) {
    try {
      await Api.learnSkill(this.character.name, skillId);
      this.character = await Api.getCharacter(this.character.name);
      this._skillData = await Api.getSkills(this.character.name);
      this._showToast("技能已学习");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`学习失败：${e.message}`, true); }
  }

  async _doResetSkills() {
    try {
      await Api.resetSkills(this.character.name);
      this.character = await Api.getCharacter(this.character.name);
      this._skillData = await Api.getSkills(this.character.name);
      this._showToast("技能已重置");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`重置失败：${e.message}`, true); }
  }

  async _doForge(slot) {
    try {
      const r = await Api.forge(this.character.name, slot);
      this.character = await Api.getCharacter(this.character.name);
      this._showToast(r.message ?? "锻造成功");
      this._clearContent(); this._refreshHeader(); this._renderTab();
    } catch (e) { this._showToast(`锻造失败：${e.message}`, true); }
  }

  // ────────────────────────────────────────────────────────────
  // 刷新头部（角色数据改变后）
  // ────────────────────────────────────────────────────────────
  _refreshHeader() {
    // 销毁旧头部对象，重建（简单做法：restart 代价太大，用 _headerObjs 跟踪）
    this._headerObjs?.forEach(o => o.destroy?.());
    this._headerObjs = [];
    const W = this.W, c = this.character;

    const push = (o) => { this._headerObjs.push(o); return o; };

    push(this.add.rectangle(W / 2, 40, W, 80, C.header).setDepth(1));
    push(this.add.text(20, 14, c.name, { fontFamily: FONT, fontSize: "18px", color: "#c9a227" }).setDepth(2));
    push(this.add.text(20, 36, `${c.class_name}  Lv.${c.level}`, { fontFamily: FONT, fontSize: "13px", color: "#a090c0" }).setDepth(2));
    const hp = this._getHp(c), maxHp = this._getMaxHp(c);
    const res = c.resource ?? 0, resMax = c.resource_max ?? 0;
    push(this.add.text(20, 54, `HP ${hp}/${maxHp}   ${c.resource_name ?? "资源"} ${res}/${resMax}`, { fontFamily: FONT, fontSize: "13px", color: "#c0c0c0" }).setDepth(2));
    push(this.add.text(W - 20, 14, `金币 ${c.gold ?? 0}`, { fontFamily: FONT, fontSize: "15px", color: "#c9a227" }).setOrigin(1, 0).setDepth(2));
    const matsStr = Object.entries(c.materials ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join("  ") || "无材料";
    push(this.add.text(W - 20, 36, matsStr, { fontFamily: FONT, fontSize: "12px", color: "#a0a0a0" }).setOrigin(1, 0).setDepth(2));
    push(this.add.text(W - 20, 54, `当前层 ${c.floor}  最高层 ${c.highest_floor ?? c.floor}`, { fontFamily: FONT, fontSize: "12px", color: "#a0a0a0" }).setOrigin(1, 0).setDepth(2));
  }

  // ────────────────────────────────────────────────────────────
  // Toast 提示
  // ────────────────────────────────────────────────────────────
  _showToast(msg, isError = false) {
    this._toastObj?.destroy?.();
    if (this._toastTimer) { this.time.removeEvent(this._toastTimer); }
    const obj = this.add.text(this.W / 2, this.H - 88, msg, {
      fontFamily: FONT, fontSize: "14px",
      color: isError ? "#d04040" : "#40d070",
      backgroundColor: isError ? "#1a0a0a" : "#0a1a0e",
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5, 0.5).setDepth(100);
    this._toastObj = obj;
    this._toastTimer = this.time.delayedCall(2000, () => obj.destroy());
    return obj;
  }
}
