/**
 * 探测小红书：文件 input 的 accept + 页签结构（上传视频 / 上传图文）。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('未找到小红书发布页'); process.exit(1); }
  await page.bringToFront();

  const info = await page.evaluate(() => {
    const out = { fileInputs: [], tabCandidates: [], navTexts: [] };

    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      out.fileInputs.push({ accept: el.accept, multiple: el.multiple, hidden: el.hidden, cls: String(el.className).slice(0, 80), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 90) : '' });
    }

    // 含「上传」「视频」「图文」「笔记」文本的可见元素（页签候选）
    for (const el of document.querySelectorAll('*')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!own || own.length > 20) continue;
      if (!/上传|图文|视频|笔记/.test(own)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0) continue;
      out.tabCandidates.push({ tag: el.tagName, text: own, cls: String(el.className).slice(0, 110), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, vis: cs.visibility });
    }

    // 顶部导航区（y<200）所有可见文本
    for (const el of document.querySelectorAll('div,span,a,li,button')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.y > 220) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 24 || t.includes('\n')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      out.navTexts.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 90), x: Math.round(r.x), y: Math.round(r.y) });
    }
    return out;
  });

  console.log('=== file inputs ===');
  for (const f of info.fileInputs) console.log(`  accept="${f.accept}" multiple=${f.multiple} hidden=${f.hidden} cls="${f.cls}" rect=${JSON.stringify(f.rect)} parent="${f.parentCls}"`);
  console.log('\n=== 页签候选（上传/图文/视频/笔记）===');
  for (const t of info.tabCandidates) console.log(`  [${t.text}] <${t.tag}> cls="${t.cls}" rect=${JSON.stringify(t.rect)}`);
  console.log('\n=== 顶部导航文本 ===');
  const seen = new Set();
  for (const n of info.navTexts) { const k = n.text + n.x + n.y; if (seen.has(k)) continue; seen.add(k); console.log(`  [${n.text}] <${n.tag}> cls="${n.cls}" @(${n.x},${n.y})`); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
