const bm = require('../../src/core/browser');
const path = require('path');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com\/f\?kw/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();
  // 确保在吧页面
  if (!/tieba\.baidu\.com\/f\?kw/.test(page.url())) {
    await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent('数字化管理师'), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }
  const bb = await page.evaluate(() => {
    const el = document.querySelector('.add-post');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('add-post @', JSON.stringify(bb));
  await page.mouse.click(bb.x, bb.y);
  await page.waitForTimeout(6000);
  console.log('URL: ' + page.url());

  const info = await page.evaluate(() => {
    const out = { editables: [], iframes: [], inputs: [], buttons: [] };
    for (const el of document.querySelectorAll('[contenteditable="true"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      out.editables.push({ cls: String(el.className).slice(0, 70), ph: el.getAttribute('data-placeholder') || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('iframe')) {
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 50) continue;
      out.iframes.push({ id: el.id, src: (el.src || '').slice(0, 90), rect: Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('input:not([type="hidden"]), textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.inputs.push({ tag: el.tagName, id: el.id || '', ph: el.placeholder || '', cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('button, a, div, span')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 8) continue;
      if (!/^(发表|发布|取消|图片|表情|视频|标题)$/.test(t)) continue;
      out.buttons.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    return out;
  });
  console.log('\n=== contenteditable ===');
  for (const e of info.editables) console.log('  cls="' + e.cls + '" ph="' + e.ph + '" @' + e.rect);
  console.log('\n=== iframe ===');
  for (const e of info.iframes) console.log('  id=' + e.id + ' src=' + e.src + ' ' + e.rect);
  console.log('\n=== input/textarea ===');
  for (const e of info.inputs) console.log('  <' + e.tag + '> id=' + e.id + ' ph="' + e.ph + '" cls="' + e.cls + '" @' + e.rect);
  console.log('\n=== 按钮 ===');
  const seen = new Set();
  for (const b of info.buttons) { const k = b.text + b.rect; if (seen.has(k)) continue; seen.add(k); console.log('  [' + b.text + '] <' + b.tag + '> cls="' + b.cls + '" @' + b.rect); }
  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-post2.png') });
  console.log('\n截图: probe-tieba-post2.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
