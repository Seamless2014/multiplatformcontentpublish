/**
 * 分步实测小红书：切页签 → 上传图片 → dump 底部按钮结构（发布 / 暂存离开）
 * 只读探测 + 上传本地测试图，不点击发布/保存。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const bm = require('../src/core/browser');

const IMG_SEL = 'input[type="file"][accept*="jpg"], input[type="file"][accept*="png"], input[type="file"][accept*="webp"]';

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();
  page.setDefaultTimeout(20000);

  await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);

  // 1) 切到「上传图文」页签（按可见坐标点击）
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('.creator-tab')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  const tab = tabs.find((t) => t.text === '上传图文' && t.x > 0 && t.y > 0 && t.y < 150);
  if (!tab) throw new Error('未找到可见的「上传图文」页签');
  await page.mouse.click(tab.x + tab.w / 2, tab.y + tab.h / 2);
  await page.waitForTimeout(2500);
  const accept = await page.evaluate(() => { const i = document.querySelector('input[type="file"]'); return i ? i.accept : null; });
  console.log('切页签后 file input accept =', accept);

  // 2) 上传本地测试图
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAaklEQVR42u3QMQEAAAgDoJnc6BpjDyRg0FctAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFPoAABlfXjXwAAAABJRU5ErkJggg==', 'base64');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-xhs-'));
  const f1 = path.join(tmpDir, 'test.png');
  fs.writeFileSync(f1, png);

  const input = page.locator(IMG_SEL).first();
  await input.waitFor({ state: 'attached', timeout: 8000 });
  await input.setInputFiles([f1]);
  console.log('已上传 1 张测试图（' + png.length + ' bytes），等待处理…');
  await page.waitForTimeout(7000);

  // 3) dump 状态 + 底部区域
  const st = await page.evaluate(() => {
    const H = window.innerHeight;
    const out = {
      editables: document.querySelectorAll('[contenteditable="true"]').length,
      textareas: [...document.querySelectorAll('textarea')].map((t) => t.placeholder || ''),
      inputs: [...document.querySelectorAll('input[type="text"], input:not([type])')].map((t) => t.placeholder || ''),
      cdnImgs: document.querySelectorAll('img[src^="http"]').length,
      bottom: [],
      draftHits: [],
    };
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const t = (el.innerText || '').trim();
      if (/暂存|草稿|存为|保存/.test(t) && t.length <= 20 && [...el.childNodes].some((n) => n.nodeType === 3 && /暂存|草稿|存为|保存/.test(n.textContent))) {
        out.draftHits.push({ text: t, tag: el.tagName, cls: String(el.className).slice(0, 100), rect: `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}` });
      }
      if (r.y < H * 0.8 || r.y > H + 10) continue;
      const cls = String(el.className);
      const btnLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /btn|button|draft|submit|publish/i.test(cls);
      if (!t && !btnLike) continue;
      out.bottom.push({ text: t.slice(0, 20), tag: el.tagName, cls: cls.slice(0, 110), rect: `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`, pe: cs.pointerEvents });
    }
    return out;
  });

  console.log('\n上传后：contenteditable=' + st.editables + ' | textarea=' + JSON.stringify(st.textareas) + ' | text-input=' + JSON.stringify(st.inputs) + ' | CDN图=' + st.cdnImgs);
  console.log('\n=== 含「暂存/草稿/保存」的元素 ===');
  if (!st.draftHits.length) console.log('  （无）');
  for (const d of st.draftHits) console.log(`  [${d.text}] <${d.tag}> cls="${d.cls}" rect=${d.rect}`);
  console.log('\n=== 底部 20% 区域可见元素 ===');
  if (!st.bottom.length) console.log('  （无）');
  for (const b of st.bottom) console.log(`  [${b.text}] <${b.tag}> cls="${b.cls}" rect=${b.rect} pe=${b.pe}`);

  const shotDir = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, 'probe-xhs-uploaded.png') }).catch(() => {});
  console.log('\n截图：screenshots/probe-xhs-uploaded.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
