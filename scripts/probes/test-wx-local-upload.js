/**
 * 实测：微信「本地上传」完整链路 —— 点菜单 → filechooser → 插入验证。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();

  // 光标入正文（最后一个 ProseMirror）
  const n = await page.locator('.ProseMirror').count();
  await page.locator('.ProseMirror').nth(n - 1).click();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(400);

  // 准备本地图片
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAaklEQVR42u3QMQEAAAgDoJnc6BpjDyRg0FctAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFPoAABlfXjXwAAAABJRU5ErkJggg==', 'base64');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wx-local-'));
  const f1 = path.join(tmpDir, 'test.png');
  fs.writeFileSync(f1, png);

  // 点开「图片」菜单
  await page.evaluate(() => {
    const el = document.querySelector('.jsInsertIcon.img');
    if (el) el.click();
  });
  await page.waitForTimeout(1200);

  // 点「本地上传」+ 捕获 filechooser
  const chooserP = page.waitForEvent('filechooser', { timeout: 8000 });
  const local = page.locator('.tpl_dropdown_menu_item', { hasText: '本地上传' }).first();
  await local.click();
  const chooser = await chooserP.catch(() => null);
  if (!chooser) { console.error('filechooser 未出现'); process.exit(1); }
  await chooser.setFiles([f1]);
  console.log('已通过 filechooser 提交图片，等待上传插入…');
  await page.waitForTimeout(7000);

  // 验证
  const check = await page.evaluate(() => {
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const bodyPm = pms[pms.length - 1];
    const imgs = bodyPm ? [...bodyPm.querySelectorAll('img')] : [];
    return { count: imgs.length, srcs: imgs.map((i) => (i.src || '').slice(0, 90)) };
  });
  console.log('正文 img: ' + check.count);
  for (const s of check.srcs) console.log('  ' + s);
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-wx-local-upload.png') });
  console.log('截图: probe-wx-local-upload.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
