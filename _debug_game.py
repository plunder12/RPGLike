import json
import subprocess
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
PORT = 9226

proc = subprocess.Popen(
    [
        EDGE,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={PORT}",
        "--remote-allow-origins=*",
        "http://127.0.0.1:8765/game",
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
time.sleep(8)

tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
page = next(t for t in tabs if t.get("type") == "page" and "8765/game" in t.get("url", ""))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=15)
ws.settimeout(15)

expr = """
(() => {
  const g = Phaser?.GAMES?.[0];
  if (!g) return { err: "no phaser game" };
  const mgr = g.scene;
  const scenes = mgr.scenes.map(s => ({
    key: s.sys.settings.key,
    status: s.sys.settings.status,
    active: s.sys.settings.active,
  }));
  const boot = mgr.getScene("BootScene");
  const title = mgr.getScene("TitleScene");
  let bootLoad = null;
  if (boot?.load) {
    bootLoad = {
      progress: boot.load.progress,
      total: boot.load.total,
      list: boot.load.list?.length,
      isLoading: boot.load.isLoading(),
    };
  }
  let titleData = null;
  if (title) {
    titleData = {
      status: title.sys.settings.status,
      active: title.sys.settings.active,
      children: title.children?.length,
      hint: title.hint?.text,
      items: title.items?.length,
    };
  }
  return { scenes, bootLoad, titleData };
})()
"""

ws.send(
    json.dumps(
        {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True},
        }
    )
)

while True:
    msg = json.loads(ws.recv())
    if msg.get("id") == 1:
        print(json.dumps(msg.get("result"), ensure_ascii=False, indent=2))
        break

ws.close()
proc.kill()
