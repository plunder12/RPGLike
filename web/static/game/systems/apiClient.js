// 与 FastAPI 后端通信的封装。

const BASE = "/api";

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText || "请求失败");
  return data;
}

const post = (path, body) =>
  req(path, { method: "POST", body: JSON.stringify(body) });

const del = (path) => req(path, { method: "DELETE" });

export const Api = {
  // ── 角色 ──
  listClasses: () => req("/classes"),
  listCharacters: () => req("/characters"),
  getCharacter: (name) => req(`/characters/${enc(name)}`),
  createCharacter: (name, classId) =>
    post("/characters", { name, class_id: classId }),
  deleteCharacter: (name) => del(`/characters/${enc(name)}`),

  // ── 城镇 ──
  rest: (name) => post(`/characters/${enc(name)}/rest`, {}),

  // ── 地牢 ──
  startFloor: (name, targetFloor = null) =>
    post(`/characters/${enc(name)}/floor/start`, { target_floor: targetFloor }),
  clearFloor: (name, floor, mode, kills) =>
    post(`/characters/${enc(name)}/floor/clear`, { floor, mode, kills }),

  // ── 装备 ──
  equipItem: (name, index) =>
    post(`/characters/${enc(name)}/equip`, { index }),
  sellItem: (name, index) =>
    post(`/characters/${enc(name)}/inventory/sell`, { index }),
  dismantleItem: (name, index) =>
    post(`/characters/${enc(name)}/inventory/dismantle`, { index }),
  sellAll: (name) => post(`/characters/${enc(name)}/inventory/sell-all`, {}),
  dismantleAll: (name) =>
    post(`/characters/${enc(name)}/inventory/dismantle-all`, {}),

  // ── 技能 ──
  getSkills: (name) => req(`/characters/${enc(name)}/skills`),
  learnSkill: (name, skillId) =>
    post(`/characters/${enc(name)}/skills/learn`, { skill_id: skillId }),
  unlearnSkill: (name, skillId) =>
    post(`/characters/${enc(name)}/skills/unlearn`, { skill_id: skillId }),
  resetSkills: (name) => post(`/characters/${enc(name)}/skills/reset`, {}),

  // ── 锻造 ──
  forge: (name, slot) => post(`/characters/${enc(name)}/forge`, { slot }),
};

function enc(s) {
  return encodeURIComponent(s);
}
