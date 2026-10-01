const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ProseMirror').forEach((pm, i) => {
      const r = pm.getBoundingClientRect();
      const parentCls = pm.parentElement ? String(pm.parentElement.className).slice(0, 60) : '';
      const imgs = [...pm.querySelectorAll('img')].map((im) => ({ src: (im.src || '').slice(0, 60), visible: im.getBoundingClientRect().width > 0 }));
      out.push({ i, cls: String(pm.className).slice(0, 50), parentCls, rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), text: (pm.innerText || '').slice(0, 30).replace(/\n/g, '|'), imgs });
    });
    return out;
  });
  for (const p of info) {
    console.log('PM#' + p.i + ' parent="' + p.parentCls + '" rect=' + p.rect + ' text="' + p.text + '" imgs=' + JSON.stringify(p.imgs));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
