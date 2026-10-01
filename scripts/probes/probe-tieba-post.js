/**
 * 探测：点击贴吧「+ 发贴」→ 编辑器结构（标题/正文/发表按钮）。
 */
const bm = require('../../src/core/browser');
const path = require('path');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com\/f\?kw/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();

  // 找「+ 发贴」按钮（文本含「发贴」）
  const btn = await page.evaluate(() => {
    const cands = [];
    for (const el of document.querySelectorAll('a, button, div, span, li')) {
      const t = (el.innerText || '').trim();
      if (!/发贴|发帖/.test(t) || t.length > 6) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      cands.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 80), x: r.x + r.width / 2, y: r.y + r.height / 2 });
    }
    return cands;
  });
  console.log('「发贴」按钮候选:');
  for (const b of btn) console.log(`  [${b.text}] <${b.tag}> cls="${b.cls}" @(${Math.round(b.x)},${Math.round(b.y)})`);

  // 点最右上的（吧头那个）
  const target = btn.sort((a, b2) => a.y - b2.y)[0];
  console.log('\n点击: [' + target.text + '] @(' + Math.round(target.x) + ',' + Math.round(target.y) + ')');
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(5000);
  console.log('URL: ' + page.url());

  const info = await page.evaluate(() => {
    const out = { editables: [], inputs: [], iframes: [], buttons: [], tabs: [] };
    for (const el of document.querySelectorAll('[contenteditable="true"]')) {
      const r = el.getBoundingClientRect();
      out.editables.push({ cls: String(el.className).slice(0, 70), ph: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || '', rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('iframe')) {
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 50) continue;
      out.iframes.push({ id: el.id, src: (el.src || '').slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('input:not([type="hidden"]), textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.inputs.push({ tag: el.tagName, id: el.id || '', ph: el.placeholder || '', cls: String(el.className).slice(0, 70), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('button, a, div, span')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 8) continue;
      if (!/^(发表|发布|取消|发贴|发帖|图片|表情|视频|标题)$/.test(t)) continue;
      out.buttons.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 70), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    for (const el of document.querySelectorAll('[class*="tab"], [class*="Tab"], [class*="switch"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 16 || t.includes('\n')) continue;
      out.tabs.push({ text: t, cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    return out;
  });

  console.log('\n=== contenteditable ===');
  for (const e of info.editables) console.log(`  cls="${e.cls}" ph="${e.ph}" @${e.rect}`);
  console.log('\n=== iframe ===');
  for (const e of info.iframes) console.log(`  id=${e.id} src=${e.src} @${e.rect}`);
  console.log('\n=== input/textarea ===');
  for (const e of info.inputs) console.log(`  <${e.tag}> id=${e.id} ph="${e.ph}" cls="${e.cls}" @${e.rect}`);
  console.log('\n=== 按钮 ===');
  const seen = new Set();
  for (const b of info.buttons) { const k = b.text + b.rect; if (seen.has(k)) continue; seen.add(k); console.log(`  [${b.text}] <${b.tag}> cls="${b.cls}" @${b.rect}`); }
  console.log('\n=== 页签 ===');
  const seen2 = new Set();
  for (const t of info.tabs) { const k = t.text + t.rect; if (seen2.has(k)) continue; seen2.add(k); console.log(`  [${t.text}] cls="${t.cls}" @${t.rect}`); }

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-post-editor.png') });
  console.log('\n截图: probe-tieba-post-editor.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
