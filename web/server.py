"""FastAPI Web 服务。"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from systems.game_controller import GameController

WEB_DIR = Path(__file__).resolve().parent
STATIC_DIR = WEB_DIR / "static"

app = FastAPI(title="文字暗黑 · Web版", version="0.1.0")
game = GameController()


class CreateCharacterReq(BaseModel):
    name: str = Field(min_length=1, max_length=20)
    class_id: str


class BattleReq(BaseModel):
    target_floor: int | None = None


class SkillReq(BaseModel):
    skill_id: str


class InventoryReq(BaseModel):
    index: int = Field(ge=0)


class ForgeReq(BaseModel):
    slot: str


@app.get("/api/classes")
def api_classes():
    return game.list_classes()


@app.get("/api/characters")
def api_characters():
    return game.list_characters()


@app.post("/api/characters")
def api_create(body: CreateCharacterReq):
    try:
        return game.create_character(body.name, body.class_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/characters/{name}")
def api_get_character(name: str):
    try:
        return game.load_character(name)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.delete("/api/characters/{name}")
def api_delete_character(name: str):
    if not game.delete_character(name):
        raise HTTPException(404, "角色不存在")
    return {"ok": True}


@app.post("/api/characters/{name}/battle")
def api_battle(name: str, body: BattleReq | None = None):
    try:
        floor = body.target_floor if body else None
        return game.run_battle(name, target_floor=floor)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/characters/{name}/skills")
def api_skills(name: str):
    try:
        return game.get_skills(name)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/characters/{name}/skills/learn")
def api_learn_skill(name: str, body: SkillReq):
    try:
        return game.learn_skill(name, body.skill_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/skills/unlearn")
def api_unlearn_skill(name: str, body: SkillReq):
    try:
        return game.unlearn_skill(name, body.skill_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/skills/reset")
def api_reset_skills(name: str):
    try:
        return game.reset_skills(name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/equip")
def api_equip(name: str, body: InventoryReq):
    try:
        return game.equip_item(name, body.index)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/inventory/sell")
def api_sell(name: str, body: InventoryReq):
    try:
        return game.sell_item(name, body.index)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/inventory/dismantle")
def api_dismantle(name: str, body: InventoryReq):
    try:
        return game.dismantle_item(name, body.index)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/inventory/sell-all")
def api_sell_all(name: str):
    try:
        return game.sell_all(name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/inventory/dismantle-all")
def api_dismantle_all(name: str):
    try:
        return game.dismantle_all(name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/characters/{name}/forge")
def api_forge(name: str, body: ForgeReq):
    try:
        return game.forge_slot(name, body.slot)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
