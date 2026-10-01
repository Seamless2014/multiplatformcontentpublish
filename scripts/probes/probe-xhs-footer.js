const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const info = await page.evaluate(() => {
    const out = {
      scrollY: window.scrollY, docH: document.documentElement.scrollHeight, viewH: window.innerHeight,
      wideHits: [], footerCandidates: [],
    };
    // 1) innerText 含「暂存」的任意元素（不限长度）
    for (const el of document.querySelectorAll('*')) {
      const t = el.innerText || '';
      if (t.includes('暂存')) {
        const r = el.getBoundingClientRect();
        out.wideHits.push({ tag: el.tagName, cls: String(el.className).slice(0, 80), text: t.replace(/\n/g, '|').slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
      }
    }
    // 2) y>900 的所有元素（视口外底部）
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (r.y < 826) continue;
      const t = (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 40);
      const cls = String(el.className).slice(0, 80);
      if (!t && !cls) continue;
      out.footerCandidates.push({ tag: el.tagName, cls, text: t, rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });

  console.log('scrollY=' + info.scrollY + ' 文档高=' + info.docH + ' 视口高=' + info.viewH);
  console.log('\n=== innerText 含「暂存」的元素 ===');
  if (!info.wideHits.length) console.log('  （无）');
  const seen = new Set();
  for (const h of info.wideHits) { const k = h.cls + h.rect; if (seen.has(k)) continue; seen.add(k); console.log('  <' + h.tag + '> cls="' + h.cls + '" rect=' + h.rect + ' text="' + h.text + '"'); }
  console.log('\n=== y>825 视口外底部元素 ===');
  if (!info.footerCandidates.length) console.log('  （无）');
  const seen2 = new Set();
  for (const h of info.footerCandidates) { const k = h.cls + h.rect; if (seen2.has(k)) continue; seen2.add(k); console.log('  <' + h.tag + '> cls="' + h.cls + '" rect=' + h.rect + ' text="' + h.text + '"'); }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
