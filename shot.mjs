// Screenshot helper: drives /opt/meta-chromium/chrome over CDP with Node's
// built-in WebSocket (no dependencies). Usage:
//   node shot.mjs <url> <out.png> [width] [height] [waitMs]
// The page URL may carry a hash (#detail=... / #filter=...) which the
// dashboard reads on load.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [url, out, wArg, hArg, waitArg] = process.argv.slice(2);
const width = Number(wArg ?? 1440);
const height = Number(hArg ?? 900);
const waitMs = Number(waitArg ?? 2500);
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const policy = readFileSync(POLICY);
const sha = createHash('sha256').update(policy).digest('hex');
const port = 9333 + Math.floor(Math.random() * 500);
const profile = `/tmp/chrome-shot-${process.pid}`;

const chrome = execFile('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  `--hatch-webgl-allowed-domains-file=${POLICY}`,
  `--hatch-webgl-allowed-domains-sha256=${sha}`,
  '--allow-file-access-from-files', '--hide-scrollbars',
  `--window-size=${width},${height}`, 'about:blank',
], () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error('chrome devtools did not come up');
}

let id = 0;
const pending = new Map();
function send(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    const msg = { id: mid, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}

try {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  const sendT = (method, params) => send(ws, method, params, sessionId);
  await sendT('Page.enable');
  await sendT('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sendT('Page.navigate', { url });
  await sleep(waitMs);
  const { data } = await sendT('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`wrote ${out}`);
} finally {
  chrome.kill('SIGKILL');
}
process.exit(0);
