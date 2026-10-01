/**
 * 实测：点击顶部「图片」菜单 → 观察上传对话框/隐藏 input/filechooser。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();

  // 监听 filechooser
  let chooserPromise = page.waitForEvent('filechooser', { timeout: 6000 }).then(() => 'filechooser 出现').catch(() => 'filechooser 未出现');

  // 点击「图片」菜单（jsInsertIcon img 或顶栏「图片」文本）
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('.jsInsertIcon.img') || [...document.querySelectorAll('*')].find((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === '图片'));
    if (!el) return '未找到图片菜单';
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, cls: String(el.className).slice(0, 80), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (typeof clicked === 'string') { console.log(clicked); process.exit(1); }
  console.log('点击图片菜单:', JSON.stringify(clicked));
  await page.mouse.click(clicked.x, clicked.y);
  await page.waitForTimeout(2000);
  console.log(await chooserPromise);

  // 看弹出的对话框与新增的 input/iframe
  const after = await page.evaluate(() => {
    const out = { dialogs: [], inputs: [], iframes: [], newVisible: [] };
    for (const el of document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="popover"], [class*="dropdown_menu"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      out.dialogs.push({ cls: String(el.className).slice(0, 90), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), text: (el.innerText || '').replace(/\n/g, '|').slice(0, 80) });
    }
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.inputs.push({ accept: (el.accept || '').slice(0, 50), rect: Math.round(r.width) + 'x' + Math.round(r.height), disp: cs.display, parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 60) : '' });
    }
    for (const el of document.querySelectorAll('iframe')) {
      const r = el.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) out.iframes.push({ id: el.id, src: (el.src || '').slice(0, 70), rect: Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });
  console.log('\n=== 可见对话框/菜单 ===');
  const seen = new Set();
  for (const d of after.dialogs) { if (seen.has(d.cls)) continue; seen.add(d.cls); console.log('  cls="' + d.cls + '" rect=' + d.rect + ' text="' + d.text + '"'); }
  console.log('\n=== file inputs（当前态）===');
  for (const i of after.inputs) console.log('  accept="' + i.accept + '" size=' + i.rect + ' disp=' + i.disp + ' parent="' + i.parentCls + '"');
  console.log('\n=== 大 iframe ===');
  for (const f of after.iframes) console.log('  id=' + f.id + ' src=' + f.src + ' ' + f.rect);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
