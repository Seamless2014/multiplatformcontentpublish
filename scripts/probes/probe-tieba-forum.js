/**
 * 探测百度贴吧具体吧的发帖页：编辑器结构 + 标题/正文输入方式。
 */
const bm = require('../../src/core/browser');
const path = require('path');

// 用户关注的吧之一
const KW = '数字化管理师';

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com/.test(p.url())) || (await ctx.newPage());
  await page.bringToFront();
  page.setDefaultTimeout(20000);

  const url = 'https://tieba.baidu.com/f?kw=' + encodeURIComponent(KW);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('URL: ' + page.url());

  const info = await page.evaluate(() => {
    const out = { publishEntries: [], editables: [], inputs: [], dialogs: [] };
    for (const el of document.querySelectorAll('a, button, div, span, li')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.y > 400) continue;
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length > 12) continue;
      if (!/发帖|发表|写文章|发布/.test(txt)) continue;
      out.publishEntries.push({ tag: el.tagName, text: txt, cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    for (const el of document.querySelectorAll('[contenteditable="true"]')) {
      const r = el.getBoundingClientRect();
      out.editables.push({ cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), ph: el.getAttribute('data-placeholder') || '' });
    }
    for (const el of document.querySelectorAll('input:not([type="hidden"]), textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0) continue;
      out.inputs.push({ tag: el.tagName, type: el.type || '', id: el.id || '', ph: el.placeholder || '', cls: String(el.className).slice(0, 60), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) });
    }
    return out;
  });

  console.log('\n=== 发帖入口 ===');
  for (const e of info.publishEntries) console.log(`  [${e.text}] <${e.tag}> cls="${e.cls}" @${e.rect}`);
  console.log('\n=== contenteditable ===');
  for (const e of info.editables) console.log(`  cls="${e.cls}" @${e.rect} ph="${e.ph}"`);
  console.log('\n=== input/textarea ===');
  for (const e of info.inputs) console.log(`  <${e.tag}> id=${e.id} ph="${e.ph}" cls="${e.cls}" @${e.rect}`);

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-forum.png') });
  console.log('\n截图: probe-tieba-forum.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
