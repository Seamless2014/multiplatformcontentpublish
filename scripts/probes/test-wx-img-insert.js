/**
 * 实测：微信编辑器图片上传 —— 光标入正文 + setInputFiles 到现有 file input。
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

  // 1) 光标放正文末尾
  const pmBody = page.locator('.ProseMirror').last(); // 正文（标题也是 ProseMirror，正文在后面）
  const n = await page.locator('.ProseMirror').count();
  console.log('ProseMirror 数量: ' + n);
  const body = page.locator('.ProseMirror').nth(n - 1);
  await body.click();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(500);

  // 2) 直接 setInputFiles 到常驻 file input
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAaklEQVR42u3QMQEAAAgDoJnc6BpjDyRg0FctAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFPoAABlfXjXwAAAABJRU5ErkJggg==', 'base64');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wx-img-'));
  const f1 = path.join(tmpDir, 'test.png');
  fs.writeFileSync(f1, png);

  const input = page.locator('input[type="file"][accept*="image"]').first();
  await input.setInputFiles([f1]);
  console.log('已 setInputFiles，等待上传插入…');
  await page.waitForTimeout(6000);

  // 3) 验证 PM 正文里的 img
  const check = await page.evaluate(() => {
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const bodyPm = pms[pms.length - 1];
    const imgs = bodyPm ? bodyPm.querySelectorAll('img') : [];
    return {
      imgCount: imgs.length,
      srcs: [...imgs].map((i) => (i.src || '').slice(0, 80)),
      uploadTips: [...document.querySelectorAll('.js_upload_tip, .weui-desktop-toast, [class*="upload"]')].map((e) => (e.innerText || '').slice(0, 40)).filter(Boolean).slice(0, 5),
    };
  });
  console.log('正文 img 数: ' + check.imgCount);
  for (const s of check.srcs) console.log('  src: ' + s);
  if (check.uploadTips.length) console.log('上传提示: ' + JSON.stringify(check.uploadTips));

  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-wx-img-inserted.png') });
  console.log('截图: probe-wx-img-inserted.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
