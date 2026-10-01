const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  let page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  console.log('微信页签数: ' + ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).length);
  if (!page) {
    page = await ctx.newPage();
    await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }
  // 打开编辑器
  const html = await page.content();
  const tokenMatch = page.url().match(/token=(\d+)/) || html.match(/token=(\d+)/);
  if (!tokenMatch) { console.error('未拿到 token，可能未登录'); process.exit(1); }
  const editorUrl = 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&token=' + tokenMatch[1] + '&lang=zh_CN';
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  await page.bringToFront();
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const out = { url: location.href.slice(0, 90), titleCandidates: [], editables: [], iframes: [] };
    // 标题候选：id/placeholder/aria
    for (const el of document.querySelectorAll('input, textarea, [contenteditable="true"]')) {
      const ph = el.placeholder || el.getAttribute('placeholder') || '';
      const aria = el.getAttribute('aria-label') || '';
      const id = el.id || '';
      const cls = String(el.className).slice(0, 80);
      const r = el.getBoundingClientRect();
      if (/title|标题|标题title/i.test(id + ' ' + ph + ' ' + aria + ' ' + cls)) {
        out.titleCandidates.push({ tag: el.tagName, id, ph, aria, cls, rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
      }
    }
    // 所有 contenteditable 与输入框
    for (const el of document.querySelectorAll('[contenteditable="true"], input:not([type="hidden"]), textarea')) {
      const r = el.getBoundingClientRect();
      out.editables.push({ tag: el.tagName, id: el.id, ph: el.placeholder || '', cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    // iframe
    for (const f of document.querySelectorAll('iframe')) {
      const r = f.getBoundingClientRect();
      out.iframes.push({ id: f.id, cls: String(f.className).slice(0, 50), src: (f.src || '').slice(0, 60), rect: Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });

  console.log('URL: ' + info.url);
  console.log('\n=== 标题候选 ===');
  if (!info.titleCandidates.length) console.log('  （无）');
  for (const t of info.titleCandidates) console.log('  <' + t.tag + '> id=' + t.id + ' ph="' + t.ph + '" aria="' + t.aria + '" cls="' + t.cls + '" rect=' + t.rect);
  console.log('\n=== 全部输入元素 ===');
  if (!info.editables.length) console.log('  （无）');
  for (const e of info.editables) console.log('  <' + e.tag + '> id=' + e.id + ' ph="' + e.ph + '" cls="' + e.cls + '" rect=' + e.rect);
  console.log('\n=== iframe ===');
  for (const f of info.iframes) console.log('  id=' + f.id + ' cls="' + f.cls + '" src=' + f.src + ' size=' + f.rect);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
