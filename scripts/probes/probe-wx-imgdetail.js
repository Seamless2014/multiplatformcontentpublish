const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const pm = pms[1];
    if (!pm) return null;
    const out = { pmHTML: pm.innerHTML.slice(0, 3000), imgDetails: [] };
    pm.querySelectorAll('img').forEach((im) => {
      const r = im.getBoundingClientRect();
      const cs = getComputedStyle(im);
      const chain = [];
      let cur = im;
      for (let i = 0; i < 4 && cur; i++) { chain.push('<' + cur.tagName + ' cls="' + String(cur.className).slice(0, 50) + '">'); cur = cur.parentElement; }
      out.imgDetails.push({ src: (im.src || '').slice(0, 50), rect: Math.round(r.width) + 'x' + Math.round(r.height), disp: cs.display, vis: cs.visibility, chain: chain.join('>'), parentHTML: im.parentElement ? im.parentElement.outerHTML.slice(0, 300) : '' });
    });
    return out;
  });
  console.log('=== img 详情 ===');
  for (const d of info.imgDetails) { console.log('  src=' + d.src + ' rect=' + d.rect + ' disp=' + d.disp + ' vis=' + d.vis + '\n    链: ' + d.chain + '\n    父HTML: ' + d.parentHTML.slice(0, 200) + '\n'); }
  console.log('=== PM HTML ===');
  console.log(info.pmHTML);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
