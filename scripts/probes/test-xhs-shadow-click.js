/**
 * 实测：DOMSnapshot 定位 shadow 内「暂存离开」按钮并真实点击。
 * 点击前若有空标题会失败，因此先填标题与正文（与正式流程一致）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const bm = require('../src/core/browser');

const IMG_SEL = 'input[type="file"][accept*="jpg"], input[type="file"][accept*="png"], input[type="file"][accept*="webp"]';

async function shadowButtonPoint(client, dpr, texts) {
  const snap = await client.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
  const { strings, documents } = snap;
  const S = (i) => (i >= 0 && strings[i] ? strings[i] : '');
  const doc = documents[0];
  const { nodes, layout } = doc;
  const ni2li = new Map();
  layout.nodeIndex.forEach((ni, li) => { if (!ni2li.has(ni)) ni2li.set(ni, li); });
  const parentOf = (ni) => (nodes.parentIndex && nodes.parentIndex[ni] >= 0 ? nodes.parentIndex[ni] : null);

  for (let i = 0; i < nodes.nodeValue.length; i++) {
    const vi = nodes.nodeValue[i];
    if (vi < 0) continue;
    const t = S(vi).trim();
    if (!texts.includes(t)) continue;
    const p = parentOf(i);
    if (p === null) continue;
    const tag = S(nodes.nodeName[p]);
    if (tag !== 'BUTTON' && tag !== 'DIV' && tag !== 'SPAN' && tag !== 'A') continue;
    const li = ni2li.get(p);
    if (li === undefined) continue;
    const b = layout.bounds[li];
    return {
      text: t,
      tag,
      x: (b[0] + b[2] / 2) / dpr,
      y: (b[1] + b[3] / 2) / dpr,
      w: b[2] / dpr,
      h: b[3] / dpr,
    };
  }
  return null;
}

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();
  page.setDefaultTimeout(20000);

  // 刷新到干净状态
  await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);

  // 切页签
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.creator-tab')].map((el) => { const r = el.getBoundingClientRect(); return { text: el.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
  const tab = tabs.find((t) => t.text === '上传图文' && t.x > 0 && t.y > 0 && t.y < 150);
  await page.mouse.click(tab.x + tab.w / 2, tab.y + tab.h / 2);
  await page.waitForTimeout(2500);

  // 上传图
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAaklEQVR42u3QMQEAAAgDoJnc6BpjDyRg0FctAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFPoAABlfXjXwAAAABJRU5ErkJggg==', 'base64');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-final-'));
  const f1 = path.join(tmpDir, 'test.png');
  fs.writeFileSync(f1, png);
  const input = page.locator(IMG_SEL).first();
  await input.waitFor({ state: 'attached', timeout: 8000 });
  await input.setInputFiles([f1]);
  await page.waitForTimeout(6000);
  console.log('图片已上传');

  // 填标题 + 正文
  const titleEl = page.locator('input[placeholder*="标题"], textarea[placeholder*="标题"]').first();
  await titleEl.fill('');
  await titleEl.fill('自动化发布器验证测试');
  const body = page.locator('[contenteditable="true"]').first();
  await body.click();
  await page.evaluate(() => { document.querySelector('[contenteditable="true"]').focus(); document.execCommand('insertText', false, '这是发布器端到端验证的正文内容，验证文字完整性。'); });
  await page.waitForTimeout(1500);
  console.log('标题正文已填');

  // CDP 定位「暂存离开」并点击
  const client = await ctx.newCDPSession(page);
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  console.log('devicePixelRatio=' + dpr);

  const btn = await shadowButtonPoint(client, dpr, ['暂存离开', '存草稿', '保存草稿']);
  if (!btn) { console.error('未在 shadow 内定位到暂存离开'); process.exit(1); }
  console.log('定位到: "' + btn.text + '" <' + btn.tag + '> 中心=(' + Math.round(btn.x) + ',' + Math.round(btn.y) + ') 尺寸=' + Math.round(btn.w) + 'x' + Math.round(btn.h));
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-xhs-before-save.png') });
  await page.mouse.click(btn.x, btn.y);
  console.log('已点击，等待保存…');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-xhs-after-save.png') });
  console.log('URL: ' + page.url());
  console.log('截图: probe-xhs-before-save.png / probe-xhs-after-save.png');
  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
