const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const t = document.querySelector('#title');
    if (!t) return { found: false };
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    const parent = t.parentElement;
    const pcs = parent ? getComputedStyle(parent) : null;
    const pr = parent ? parent.getBoundingClientRect() : null;
    // 向上找 3 层
    const chain = [];
    let cur = parent;
    for (let i = 0; i < 4 && cur; i++) {
      const c = getComputedStyle(cur);
      const rr = cur.getBoundingClientRect();
      chain.push({ tag: cur.tagName, cls: String(cur.className).slice(0, 70), rect: Math.round(rr.x) + ',' + Math.round(rr.y) + ',' + Math.round(rr.width) + 'x' + Math.round(rr.height), disp: c.display, vis: c.visibility, ovf: c.overflow, h: c.height });
      cur = cur.parentElement;
    }
    return {
      found: true,
      self: { rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), disp: cs.display, vis: cs.visibility, h: cs.height, minH: cs.minHeight, maxH: cs.maxHeight, pad: cs.padding, boxSizing: cs.boxSizing, opacity: cs.opacity, value: (t.value || '').slice(0, 20) },
      parentChain: chain,
    };
  });
  console.log(JSON.stringify(info, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
