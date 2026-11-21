"""Verify the page's detail-view farm steps match board.json exactly."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/tr-out/dashboard/index.html").as_uri()
board = json.load(open("/tmp/tr-out/board.json"))
by_slug = {r["slug"]: r for r in board["rows"]}

# Pick a spread: the leader, the capped Steakhouse, a Solana row, a null-7d row.
targets = ["ethena-usde", "steakhouse-financial", "raydium-amm", "sky-lending", "pancakeswap-amm"]
null7d = [r["slug"] for r in board["rows"] if r["change_7d"] is None][:1]
targets += null7d
print("targets:", targets)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(OUT)
    page.wait_for_timeout(600)
    bad = 0
    for slug in targets:
        # search for the protocol, then click its row
        page.fill("#q", slug.replace("-", " "))
        page.wait_for_timeout(300)
        row = page.locator("#boardBody tr").first
        name = row.locator("td").nth(1).inner_text()
        row.click()
        page.wait_for_timeout(400)
        steps = page.locator("#detail .steps p").all_inner_texts()
        steps = [s.strip() for s in steps]
        # strip the leading "N." the page adds (inner_text joins it with no space)
        import re as _re
        steps = [_re.sub(r"^\d+\.\s*", "", s) for s in steps]
        want = by_slug[slug]["farm_steps"]
        ok = steps == want
        print(f"{slug}: {'MATCH' if ok else 'MISMATCH'} ({len(steps)} steps)")
        if not ok:
            bad += 1
            for i, (a, b) in enumerate(zip(steps, want)):
                if a != b:
                    print(f"  step {i+1} page: {a[:120]}")
                    print(f"  step {i+1} json: {b[:120]}")
        page.fill("#q", "")
        page.wait_for_timeout(200)
    print("mismatches:", bad)
    browser.close()
