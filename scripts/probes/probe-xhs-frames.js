const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  // 1) 主文档中的 iframe 列表
  const frames = page.frames();
  console.log('=== frames ===');
  for (const f of frames) console.log('  url=' + f.url().slice(0, 100) + (f === page.mainFrame() ? '  [主文档]' : ''));

  // 2) 在每个 frame 里搜「暂存离开」「发布」
  for (const f of frames) {
    try {
      const r = await f.evaluate(() => {
        const res = {};
        for (const key of ['暂存离开', '发布']) {
          const hits = [];
          for (const el of document.querySelectorAll('*')) {
            const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
            if (own === key || (own.includes(key) && own.length <= 10)) {
              const r2 = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              hits.push({ tag: el.tagName, cls: String(el.className).slice(0, 90), rect: Math.round(r2.x) + ',' + Math.round(r2.y) + ',' + Math.round(r2.width) + 'x' + Math.round(r2.height), vis: cs.visibility, disp: cs.display });
            }
          }
          res[key] = hits;
        }
        return res;
      }).catch(() => null);
      if (!r) { console.log('\nframe ' + f.url().slice(0, 60) + ' : 无法访问（跨域）'); continue; }
      const hasHit = r['暂存离开'].length || r['发布'].length;
      if (!hasHit) continue;
      console.log('\n=== frame: ' + f.url().slice(0, 90) + ' ===');
      for (const k of ['暂存离开', '发布']) {
        for (const h of r[k]) console.log('  [' + k + '] <' + h.tag + '> cls="' + h.cls + '" rect=' + h.rect + ' vis=' + h.vis + ' disp=' + h.disp);
      }
    } catch (e) { /* ignore */ }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
