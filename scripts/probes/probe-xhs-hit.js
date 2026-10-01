const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const r = await page.evaluate(() => {
    const out = { probes: [], shadowRoots: 0, hostsWithShadow: [] };
    // 截图上「暂存离开」约在 (463,548)/0.703 → (659,780)；「发布」(555,548) → (789,780)
    for (const [label, x, y] of [['暂存离开?', 659, 780], ['发布?', 789, 780], ['暂存-左', 620, 780], ['暂存-上', 659, 760]]) {
      const el = document.elementFromPoint(x, y);
      if (!el) { out.probes.push(label + ' @' + x + ',' + y + ' → null'); continue; }
      const chain = [];
      let cur = el;
      let hops = 0;
      while (cur && hops < 6) {
        chain.push('<' + cur.tagName + (cur.className && typeof cur.className === 'string' ? ' cls=' + cur.className.slice(0, 60) : '') + '>' + (cur.shadowRoot ? '[SHADOW]' : ''));
        cur = cur.parentElement || (cur.getRootNode && cur.getRootNode().host);
        hops++;
      }
      out.probes.push(label + ' @' + x + ',' + y + ' → ' + (el.innerText || '').trim().slice(0, 20) + ' | 链: ' + chain.join(' > '));
    }
    // 统计 shadow root
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          out.shadowRoots++;
          out.hostsWithShadow.push('<' + el.tagName + '> cls=' + String(el.className).slice(0, 60));
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    return out;
  });
  for (const p of r.probes) console.log(p);
  console.log('\nshadow roots 总数: ' + r.shadowRoots);
  for (const h of r.hostsWithShadow.slice(0, 20)) console.log('  ' + h);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
