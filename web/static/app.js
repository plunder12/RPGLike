const API = "/api";

let currentChar = null;
let battlePlaying = false;

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

function $(id) { return document.getElementById(id); }
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setMsg(id, text, isErr = false) {
  const el = $(id);
  el.textContent = text || "";
  el.style.color = isErr ? "#e88" : "";
}

// ── 标题页 ──
async function loadTitle() {
  hide($("view-game"));
  show($("view-title"));
  currentChar = null;
  const chars = await api("/characters");
  const list = $("char-list");
  list.innerHTML = "";
  if (!chars.length) {
    list.innerHTML = '<p class="muted">暂无角色，请创建</p>';
  }
  chars.forEach((c) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<strong>${c.name}</strong> · ${c.class_display} · Lv.${c.level} · 最高${c.floor}层`;
    div.onclick = () => enterGame(c.name);
    list.appendChild(div);
  });
  const classes = await api("/classes");
  const sel = $("new-class");
  sel.innerHTML = classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

async function enterGame(name) {
  currentChar = await api(`/characters/${encodeURIComponent(name)}`);
  renderGame();
  hide($("view-title"));
  show($("view-game"));
}

$("btn-create").onclick = async () => {
  try {
    const name = $("new-name").value.trim();
    const class_id = $("new-class").value;
    await api("/characters", { method: "POST", body: JSON.stringify({ name, class_id }) });
    setMsg("title-msg", "创建成功");
    await enterGame(name);
  } catch (e) {
    setMsg("title-msg", e.message, true);
  }
};

$("btn-back").onclick = () => loadTitle();

// ── 主界面渲染 ──
function renderGame() {
  const c = currentChar;
  if (!c) return;
  $("hero-title").textContent = `${c.name} · ${c.class_name} · Lv.${c.level}`;
  $("hero-sub").textContent = `第${c.floor}层 | 已通关${c.highest_floor}层 | 金币${c.gold} | 技能点${c.skill_points} | ${c.materials_summary}`;

  const sg = $("stats-grid");
  const s = c.stats;
  sg.innerHTML = `
    <div class="stat-box"><strong>${s.max_hp}</strong>生命</div>
    <div class="stat-box"><strong>${s.attack}</strong>攻击</div>
    <div class="stat-box"><strong>${s.defense}</strong>防御</div>
    <div class="stat-box"><strong>${(s.crit_rate*100).toFixed(1)}%</strong>暴击率</div>
    <div class="stat-box"><strong>${(s.skill_damage*100).toFixed(1)}%</strong>技能伤</div>
    <div class="stat-box"><strong>${s.hp_regen}</strong>回血/回合</div>
  `;

  $("btn-battle-push").disabled = !c.can_push;
  $("farm-floor").max = c.highest_floor || 1;

  renderInventory();
  renderSkills();
  renderForge();
}

function renderInventory() {
  const c = currentChar;
  const eq = $("equipped-list");
  eq.innerHTML = "<h3>已装备</h3>";
  Object.values(c.equipment).forEach((slot) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const fl = slot.forge_level ? ` +锻造Lv.${slot.forge_level}` : "";
    div.textContent = `${slot.slot_name}${fl}: ${slot.item ? slot.item.summary : "（空）"}`;
    eq.appendChild(div);
  });

  const inv = $("inventory-list");
  inv.innerHTML = "";
  if (!c.inventory.length) {
    inv.innerHTML = '<p class="muted">背包为空</p>';
    return;
  }
  c.inventory.forEach((item) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <span>${item.compare} ${item.summary}</span>
      <span class="actions-inline">
        <button data-equip="${item.index}">装备</button>
        <button data-sell="${item.index}">售${item.sell_gold}</button>
        <button data-dismantle="${item.index}">分解</button>
      </span>`;
    inv.appendChild(div);
  });
  inv.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.onclick = () => invAction("equip", +btn.dataset.equip);
  });
  inv.querySelectorAll("[data-sell]").forEach((btn) => {
    btn.onclick = () => invAction("sell", +btn.dataset.sell);
  });
  inv.querySelectorAll("[data-dismantle]").forEach((btn) => {
    btn.onclick = () => invAction("dismantle", +btn.dataset.dismantle);
  });
}

async function invAction(type, index) {
  const name = encodeURIComponent(currentChar.name);
  const paths = {
    equip: `/characters/${name}/equip`,
    sell: `/characters/${name}/inventory/sell`,
    dismantle: `/characters/${name}/inventory/dismantle`,
  };
  try {
    const r = await api(paths[type], { method: "POST", body: JSON.stringify({ index }) });
    currentChar = r.character;
    setMsg("game-msg", r.message);
    renderGame();
  } catch (e) {
    setMsg("game-msg", e.message, true);
  }
}

$("btn-sell-all").onclick = async () => {
  if (!confirm("确认一键售卖全部？")) return;
  try {
    const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/inventory/sell-all`, { method: "POST" });
    currentChar = r.character;
    setMsg("game-msg", r.message);
    renderGame();
  } catch (e) { setMsg("game-msg", e.message, true); }
};

$("btn-dismantle-all").onclick = async () => {
  if (!confirm("确认一键分解全部？")) return;
  try {
    const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/inventory/dismantle-all`, { method: "POST" });
    currentChar = r.character;
    setMsg("game-msg", r.message);
    renderGame();
  } catch (e) { setMsg("game-msg", e.message, true); }
};

async function renderSkills() {
  $("skill-points").textContent = currentChar.skill_points;
  const skills = await api(`/characters/${encodeURIComponent(currentChar.name)}/skills`);
  const list = $("skill-list");
  list.innerHTML = "";
  skills.forEach((sk) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const rank = sk.rank ? `Lv.${sk.rank}/${sk.max_rank}` : "未学习";
    div.innerHTML = `
      <div>
        <strong>[${sk.type === "active" ? "主动" : "被动"}] ${sk.name}</strong> (${rank})<br/>
        <span class="muted">${sk.desc}</span><br/>
        <small>${sk.values}</small>
      </div>
      <span>
        <button data-learn="${sk.id}">+1</button>
        ${sk.rank ? `<button data-unlearn="${sk.id}">-1</button>` : ""}
      </span>`;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-learn]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/skills/learn`, {
          method: "POST", body: JSON.stringify({ skill_id: btn.dataset.learn }),
        });
        currentChar = r.character;
        setMsg("game-msg", r.message);
        renderGame();
      } catch (e) { setMsg("game-msg", e.message, true); }
    };
  });
  list.querySelectorAll("[data-unlearn]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/skills/unlearn`, {
          method: "POST", body: JSON.stringify({ skill_id: btn.dataset.unlearn }),
        });
        currentChar = r.character;
        setMsg("game-msg", r.message);
        renderGame();
      } catch (e) { setMsg("game-msg", e.message, true); }
    };
  });
}

$("btn-reset-skills").onclick = async () => {
  if (!confirm("重置全部技能？")) return;
  try {
    const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/skills/reset`, { method: "POST" });
    currentChar = r.character;
    setMsg("game-msg", r.message);
    renderGame();
  } catch (e) { setMsg("game-msg", e.message, true); }
};

function renderForge() {
  $("forge-mats").textContent = currentChar.materials_summary;
  const list = $("forge-list");
  list.innerHTML = "";
  currentChar.forge_slots.forEach((f) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div><strong>${f.slot_name}</strong> Lv.${f.level}<br/><small class="muted">${f.desc}</small></div>
      <button data-forge="${f.slot}">锻造 (${f.cost})</button>`;
    list.appendChild(div);
  });
  list.querySelectorAll("[data-forge]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/forge`, {
          method: "POST", body: JSON.stringify({ slot: btn.dataset.forge }),
        });
        currentChar = r.character;
        setMsg("game-msg", r.message);
        renderGame();
      } catch (e) { setMsg("game-msg", e.message, true); }
    };
  });
}

// ── Tabs ──
document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => hide(p));
    show($(`tab-${btn.dataset.tab}`));
  };
});

// ── 战斗 ──
function updateBars(player, enemy) {
  if (player) {
    const pct = player.max_hp ? (player.hp / player.max_hp * 100) : 0;
    $("bar-player").style.width = pct + "%";
    $("bar-player-text").textContent = `${player.hp}/${player.max_hp}`;
  }
  if (enemy) {
    const pct = enemy.max_hp ? (enemy.hp / enemy.max_hp * 100) : 0;
    $("bar-enemy").style.width = pct + "%";
    $("bar-enemy-text").textContent = `${enemy.hp}/${enemy.max_hp}`;
    $("bar-enemy-label").textContent = enemy.name ? `敌方` : "敌方";
  }
}

function appendLog(text) {
  const log = $("battle-log");
  const p = document.createElement("div");
  if (text.startsWith(">>")) p.className = "action-player";
  if (text.startsWith("<<")) p.className = "action-enemy";
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

async function playTimeline(timeline) {
  battlePlaying = true;
  $("battle-log").innerHTML = "";
  hide($("battle-result"));
  hide($("btn-close-battle"));

  for (const ev of timeline) {
    if (!battlePlaying) break;
    await sleep(400);
    if (ev.type === "start") {
      $("battle-title").textContent = `第 ${ev.floor} 层 · ${ev.monster.name}${ev.monster.tag ? " ["+ev.monster.tag+"]" : ""}`;
    } else if (ev.type === "turn") {
      appendLog(`--- 回合 ${ev.turn} ---`);
      updateBars(ev.player, ev.enemy);
    } else if (ev.type === "action") {
      appendLog(ev.text);
    } else if (ev.type === "hp") {
      updateBars(ev.player, ev.enemy);
    }
  }
  battlePlaying = false;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function startBattle(floor) {
  try {
    show($("battle-overlay"));
    $("battle-title").textContent = "战斗进行中...";
    updateBars({ hp: 1, max_hp: 1 }, { hp: 1, max_hp: 1, name: "" });

    const body = floor != null ? { target_floor: floor } : {};
    const r = await api(`/characters/${encodeURIComponent(currentChar.name)}/battle`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    await playTimeline(r.timeline);
    currentChar = r.character;

    const res = $("battle-result");
    let html = `<strong>${r.message}</strong><br/>`;
    if (r.victory) {
      html += `经验+${r.exp} 金币+${r.gold}`;
      if (r.loot) html += `<br/>掉落: ${r.loot.summary}`;
      r.level_msgs.forEach((m) => { html += `<br/>${m}`; });
    }
    res.innerHTML = html;
    show(res);
    show($("btn-close-battle"));
    renderGame();
  } catch (e) {
    hide($("battle-overlay"));
    setMsg("game-msg", e.message, true);
  }
}

$("btn-battle-push").onclick = () => startBattle(null);
$("btn-battle-farm").onclick = () => {
  const f = parseInt($("farm-floor").value, 10);
  if (f >= 1) startBattle(f);
};

$("btn-close-battle").onclick = () => {
  battlePlaying = false;
  hide($("battle-overlay"));
};

// ── 启动 ──
loadTitle().catch((e) => setMsg("title-msg", e.message, true));
