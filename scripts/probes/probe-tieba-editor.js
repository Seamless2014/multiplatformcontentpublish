/**
 * 探测：点击贴吧「发布」菜单 → 打开的发帖表单结构。
 */
const bm = require('../../src/core/browser');
const path = require('path');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com\/f\?kw/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();

  // 点击「发布」菜单项
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.menu-item')].find((e) => e.innerText.trim() === '发布');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (clicked) {
    console.log('点击「发布」@' + JSON.stringify(clicked));
    await page.mouse.click(clicked.x, clicked.y);
  } else {
    console.log('未找到「发布」菜单项');
  }
  await page.waitForTimeout(5000);
  console.log('当前 URL: ' + page.url());

  const info = await page.evaluate(() => {
    const out = { editables: [], inputs: [], buttons: [], tabs: [] };
    for (const el of document.querySelectorAll('[contenteditable="true"], iframe')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      out.editables.push({ tag: el.tagName, id: el.id || '', cls: String(el.className).slice(0, 70), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
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
      if (!t || t.length > 10) continue;
      if (!/发表|发布|取消|存草稿|发帖|图片|视频/.test(t)) continue;
      out.buttons.push({ tag: el.tagName, text: t, cls: String(el.className).slice(0, 70), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    for (const el of document.querySelectorAll('[class*="tab"], [class*="Tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || '').trim();
      if (!t || t.length > 20) continue;
      out.tabs.push({ text: t.replace(/\n/g, '|'), cls: String(el.className).slice(0, 70), rect: Math.round(r.x) + ',' + Math.round(r.y) });
    }
    return out;
  });

  console.log('\n=== contenteditable / iframe ===');
  for (const e of info.editables) console.log(`  <${e.tag}> id=${e.id} cls="${e.cls}" @${e.rect}`);
  console.log('\n=== input/textarea ===');
  for (const e of info.inputs) console.log(`  <${e.tag}> id=${e.id} ph="${e.ph}" cls="${e.cls}" @${e.rect}`);
  console.log('\n=== 按钮 ===');
  const seen = new Set();
  for (const b of info.buttons) { const k = b.text + b.rect; if (seen.has(k)) continue; seen.add(k); console.log(`  [${b.text}] <${b.tag}> cls="${b.cls}" @${b.rect}`); }
  console.log('\n=== 页签 ===');
  const seen2 = new Set();
  for (const t of info.tabs) { const k = t.text + t.rect; if (seen2.has(k)) continue; seen2.add(k); console.log(`  [${t.text}] cls="${t.cls}" @${t.rect}`); }

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-editor.png') });
  console.log('\n截图: probe-tieba-editor.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
