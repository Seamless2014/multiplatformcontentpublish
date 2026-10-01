/**
 * 探测微博发博框：textarea/contenteditable、图片按钮、发送按钮。
 */
const bm = require('../../src/core/browser');
const path = require('path');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /weibo\.com\/(\?|$)/.test(p.url())) || ctx.pages().find((p) => /weibo\.com/.test(p.url()));
  if (!page) { console.error('无微博页'); process.exit(1); }
  await page.bringToFront();
  if (!/weibo\.com\/?$/.test(page.url())) {
    await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  }

  const info = await page.evaluate(() => {
    const out = { editables: [], textareas: [], inputs: [], sendBtns: [], imgBtns: [] };
    for (const el of document.querySelectorAll('[contenteditable="true"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.editables.push({ cls: String(el.className).slice(0, 80), ph: el.getAttribute('data-placeholder') || el.getAttribute('aria-label') || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.textareas.push({ cls: String(el.className).slice(0, 80), ph: el.placeholder || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      out.inputs.push({ accept: (el.accept || '').slice(0, 60), multiple: el.multiple, size: Math.round(r.width) + 'x' + Math.round(r.height), cls: String(el.className).slice(0, 60), parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 70) : '' });
    }
    for (const el of document.querySelectorAll('button, a, div, span')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 6) continue;
      if (/^(发送|发布)$/.test(t)) out.sendBtns.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) });
      if (/^(图片|图片视频|相册|表情)$/.test(t)) out.imgBtns.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    return out;
  });

  console.log('=== contenteditable ===');
  for (const e of info.editables) console.log('  cls="' + e.cls + '" ph="' + e.ph + '" @' + e.rect);
  console.log('\n=== textarea ===');
  for (const e of info.textareas) console.log('  ph="' + e.ph + '" cls="' + e.cls + '" @' + e.rect);
  console.log('\n=== file inputs ===');
  for (const i of info.inputs) console.log('  accept="' + i.accept + '" multiple=' + i.multiple + ' size=' + i.size + ' cls="' + i.cls + '" parent="' + i.parentCls + '"');
  console.log('\n=== 发送按钮 ===');
  for (const b of info.sendBtns) console.log('  [' + b.text + '] <' + b.tag + '> cls="' + b.cls + '" @' + b.rect);
  console.log('\n=== 图片按钮 ===');
  for (const b of info.imgBtns) console.log('  [' + b.text + '] <' + b.tag + '> cls="' + b.cls + '" @' + b.rect);

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-weibo-composer.png') });
  console.log('\n截图: probe-weibo-composer.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
