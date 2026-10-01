const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const out = { imgBtns: [], fileInputs: [], menus: [] };
    // 工具栏图片按钮
    for (const el of document.querySelectorAll('[class*="insertimage"], [class*="img"], [aria-label*="图片"], [title*="图片"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      const t = (el.getAttribute('title') || el.getAttribute('aria-label') || '') + '|' + String(el.className).slice(0, 70);
      if (!/image|img|图片/i.test(t)) continue;
      out.imgBtns.push({ tag: el.tagName, cls: String(el.className).slice(0, 90), title: el.getAttribute('title') || '', aria: el.getAttribute('aria-label') || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    // file input
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      out.fileInputs.push({ accept: (el.accept || '').slice(0, 60), cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y), parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 70) : '' });
    }
    // UEditor 工具栏按钮列表
    for (const el of document.querySelectorAll('.edui-toolbar .edui-button, .edui-toolbar [class*="edui-for-"]')) {
      const cls = String(el.className);
      const m = cls.match(/edui-for-([\w-]+)/);
      if (m) out.menus.push(m[1]);
    }
    return out;
  });
  console.log('=== 图片按钮 ===');
  const seen = new Set();
  for (const b of info.imgBtns) { if (seen.has(b.cls)) continue; seen.add(b.cls); console.log('  <' + b.tag + '> cls="' + b.cls + '" title="' + b.title + '" rect=' + b.rect); }
  console.log('\n=== file inputs ===');
  for (const f of info.fileInputs) console.log('  accept="' + f.accept + '" cls="' + f.cls + '" @' + f.rect + ' parent="' + f.parentCls + '"');
  console.log('\n=== UEditor 工具栏按钮 ===');
  console.log('  ' + [...new Set(info.menus)].join(', '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
