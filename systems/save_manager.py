"""存档管理。"""

import json
from pathlib import Path

from models.character import Character


class SaveManager:
    def __init__(self, save_dir: Path | None = None):
        if save_dir is None:
            save_dir = Path(__file__).resolve().parent.parent / "saves"
        self.save_dir = save_dir
        self.save_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        safe = "".join(c for c in name if c.isalnum() or c in "_-")
        return self.save_dir / f"{safe}.json"

    def list_characters(self) -> list[dict]:
        chars = []
        for fp in sorted(self.save_dir.glob("*.json")):
            try:
                data = json.loads(fp.read_text(encoding="utf-8"))
                chars.append({
                    "name": data["name"],
                    "class_name": data.get("class_id", "?"),
                    "level": data.get("level", 1),
                    "floor": data.get("highest_floor", data.get("floor", 1)),
                    "file": fp.name,
                })
            except (json.JSONDecodeError, KeyError):
                continue
        return chars

    def save(self, character: Character) -> None:
        path = self._path(character.name)
        path.write_text(
            json.dumps(character.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load(self, name: str) -> Character | None:
        path = self._path(name)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return Character.from_dict(data)

    def delete(self, name: str) -> bool:
        path = self._path(name)
        if path.exists():
            path.unlink()
            return True
        return False

    def exists(self, name: str) -> bool:
        return self._path(name).exists()
