const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const box = document.querySelector('.js_title_main');
    if (!box) return { found: false };
    const out = { found: true, children: [], html: box.innerHTML.slice(0, 1500) };
    for (const el of box.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.children.push({ tag: el.tagName, id: el.id || '', cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), vis: cs.visibility, ce: el.isContentEditable, tag2: el.tagName === 'IFRAME' ? 'IFRAME' : '' });
    }
    return out;
  });
  console.log('found=' + info.found);
  for (const c of info.children) console.log('  <' + c.tag + '> id=' + c.id + ' cls="' + c.cls + '" rect=' + c.rect + ' vis=' + c.vis + ' contentEditable=' + c.ce);
  console.log('\nHTML:\n' + info.html);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
