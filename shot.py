"""Take the four token-radar screenshots at 1440x900 from the built dashboard."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/tr-out/dashboard/index.html").as_uri()
SHOTS = Path("/home/hatch/workspace/makefun/token-radar-entry-v6/screenshots")
SHOTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(OUT)
    page.wait_for_timeout(800)

    # 1. Board view, top of the table.
    page.screenshot(path=str(SHOTS / "01-board.jpg"), type="jpeg", quality=80)
    print("01-board done")

    # 2. Detail view: open the #1 row (Ethena USDe) and show its detail panel.
    page.click("#boardBody tr >> nth=0")
    page.wait_for_timeout(600)
    page.screenshot(path=str(SHOTS / "02-detail.jpg"), type="jpeg", quality=80)
    print("02-detail done")

    # 3. Filtered view: fresh load, category Lending, no detail panel open.
    page.goto(OUT)
    page.wait_for_timeout(800)
    page.select_option("#fCat", "Lending")
    page.wait_for_timeout(400)
    page.screenshot(path=str(SHOTS / "03-filtered.jpg"), type="jpeg", quality=80)
    print("03-filtered done")
    print("horizontal overflow:", page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"))

    # 4. Method view: the size curve, the band, the per-$1k slice.
    page.click("#tabs button[data-view='method']")
    page.wait_for_timeout(400)
    page.screenshot(path=str(SHOTS / "04-model.jpg"), type="jpeg", quality=80)
    print("04-model done")

    print("page errors:", errors if errors else "none")
    browser.close()

for f in sorted(SHOTS.glob("*.jpg")):
    print(f.name, f.stat().st_size, "bytes")
