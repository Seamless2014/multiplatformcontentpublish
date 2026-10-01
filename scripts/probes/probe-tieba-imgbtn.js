/**
 * 探测：贴吧「图片」按钮 → filechooser / 隐藏 input / 弹窗。
 */
const bm = require('../../src/core/browser');
const path = require('path');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /tieba\.baidu\.com\/f\?kw/.test(p.url()));
  if (!page) { console.error('未找到贴吧页面'); process.exit(1); }
  await page.bringToFront();

  // 编辑器可能已关闭，重新打开
  const hasEditor = await page.evaluate(() => document.querySelectorAll('.ql-editor').length >= 2);
  if (!hasEditor) {
    const bb = await page.evaluate(() => { const el = document.querySelector('.add-post'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(bb.x, bb.y);
    await page.waitForTimeout(5000);
  }
  console.log('编辑器 ql-editor 数: ' + await page.locator('.ql-editor').count());

  // 监听 filechooser
  const chooserP = page.waitForEvent('filechooser', { timeout: 6000 }).then(() => true).catch(() => false);

  // 点「图片」按钮
  const imgBtn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.action-btn')];
    const el = els.find((e) => e.innerText.trim() === '图片');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!imgBtn) { console.error('未找到图片按钮'); process.exit(1); }
  console.log('点击图片按钮 @', JSON.stringify(imgBtn));
  await page.mouse.click(imgBtn.x, imgBtn.y);
  const chooser = await chooserP;
  console.log('filechooser: ' + (chooser ? '出现' : '未出现'));
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const out = { inputs: [], dialogs: [] };
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.inputs.push({ accept: (el.accept || '').slice(0, 60), multiple: el.multiple, size: Math.round(r.width) + 'x' + Math.round(r.height), disp: cs.display, cls: String(el.className).slice(0, 60), parentCls: el.parentElement ? String(el.parentElement.className).slice(0, 70) : '' });
    }
    for (const el of document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="Dialog"], [class*="Modal"], [class*="upload"], [class*="Upload"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const t = (el.innerText || '').replace(/\n/g, '|').slice(0, 60);
      out.dialogs.push({ cls: String(el.className).slice(0, 80), rect: Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height), text: t });
    }
    return out;
  });
  console.log('\n=== file inputs ===');
  for (const i of after.inputs) console.log(`  accept="${i.accept}" multiple=${i.multiple} size=${i.size} disp=${i.disp} cls="${i.cls}" parent="${i.parentCls}"`);
  console.log('\n=== 弹窗/上传组件 ===');
  const seen = new Set();
  for (const d of after.dialogs) { const k = d.cls + d.rect; if (seen.has(k)) continue; seen.add(k); console.log(`  cls="${d.cls}" @${d.rect} text="${d.text}"`); }

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-imgbtn.png') });
  console.log('\n截图: probe-tieba-imgbtn.png');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
