/**
 * 探测小红书发布页：当前状态（是否已上传图片）+ 底部操作区真实结构。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('未找到小红书发布页'); process.exit(1); }
  await page.bringToFront();

  const info = await page.evaluate(() => {
    const H = window.innerHeight, W = window.innerWidth;
    const out = { W, H, url: location.href, hasFileInput: 0, imgThumbs: 0, draftArea: [], bottomStrip: [] };

    out.hasFileInput = document.querySelectorAll('input[type="file"]').length;
    out.imgThumbs = document.querySelectorAll('.img-container img, [class*="preview"] img, [class*="thumb"] img').length;
    out.contentEditables = document.querySelectorAll('[contenteditable="true"]').length;
    out.textareas = [...document.querySelectorAll('textarea')].map((t) => ({ ph: t.placeholder, val: t.value.slice(0, 20), cls: String(t.className).slice(0, 80) }));

    // 底部 25% 区域所有可见元素（带文本 或 button-like）
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.y < H * 0.72) continue;
      if (r.y > H) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const txt = (el.innerText || '').trim().slice(0, 24);
      const cls = String(el.className);
      const btnLike = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /btn|button/i.test(cls) || /draft|submit|save/i.test(cls);
      if (!txt && !btnLike) continue;
      out.bottomStrip.push({ tag: el.tagName, txt, cls: cls.slice(0, 110), y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), pe: cs.pointerEvents });
    }

    // 找含「草稿」文本的所有元素（含 hidden）
    for (const el of document.querySelectorAll('*')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (!own) continue;
      if (!/草稿|暂存|存草稿|存为/.test(own)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.draftArea.push({ tag: el.tagName, text: own.slice(0, 30), cls: String(el.className).slice(0, 120), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, vis: cs.visibility, disp: cs.display });
    }
    return out;
  });

  console.log('URL:', info.url);
  console.log('视口:', info.W + 'x' + info.H, '| file inputs:', info.hasFileInput, '| 缩略图:', info.imgThumbs, '| contenteditable:', info.contentEditables);
  console.log('textarea:', JSON.stringify(info.textareas));
  console.log('\n=== 含「草稿/暂存」的元素（含隐藏）===');
  for (const d of info.draftArea) console.log(`  [${d.text}] <${d.tag}> cls="${d.cls}" rect=${JSON.stringify(d.rect)} vis=${d.vis} disp=${d.disp}`);
  if (!info.draftArea.length) console.log('  （无）');
  console.log('\n=== 底部 28% 区域可见元素 ===');
  for (const b of info.bottomStrip) console.log(`  [${b.txt}] <${b.tag}> cls="${b.cls}" rect=(${b.x},${b.y},${b.w}x${b.h}) pe=${b.pe}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
