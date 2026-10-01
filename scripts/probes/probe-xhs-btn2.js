const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const out = { hits: [], btns: [] };
    for (const el of document.querySelectorAll('*')) {
      const t = (el.innerText || '').trim();
      if (t.includes('暂存离开') && t.length < 40) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.hits.push({ tag: el.tagName, cls: String(el.className).slice(0, 110), text: t.slice(0, 30), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), vis: cs.visibility, disp: cs.display, pe: cs.pointerEvents });
      }
    }
    for (const b of document.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      out.btns.push({ text: (b.innerText || '').trim().slice(0, 20), cls: String(b.className).slice(0, 100), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });
  console.log('=== 含「暂存离开」文本的元素 ===');
  if (!info.hits.length) console.log('  （无）');
  for (const h of info.hits) console.log('  [' + h.text + '] <' + h.tag + '> cls="' + h.cls + '" rect=' + h.rect + ' vis=' + h.vis + ' disp=' + h.disp + ' pe=' + h.pe);
  console.log('\n=== 全部 <button> ===');
  for (const b of info.btns) console.log('  [' + b.text + '] cls="' + b.cls + '" rect=' + b.rect);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
