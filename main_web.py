"""Web 版入口 — python main_web.py"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import uvicorn

if __name__ == "__main__":
    port = 8765
    print(f"文字暗黑 Web 版: http://127.0.0.1:{port}")
    print(f"局域网访问: http://<本机IP>:{port}  （文字版 /  2D: /game）")
    uvicorn.run("web.server:app", host="0.0.0.0", port=port, reload=False)
