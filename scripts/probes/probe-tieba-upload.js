/* 探测：贴吧发贴「图片」按钮 → filechooser 上传 → 图片去哪了 */
const path = require('path');
const fs = require('fs');
const bm = require(path.join(__dirname, '..', '..', 'src', 'core', 'browser'));

// 生成 1 张 200x76 红色 PNG（与测试图同尺寸级别）
function makePng(file) {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAABMCAYAAACZTq0gAAAAaElEQVR4nO3BMQEAAADCoPVPbQlPoAAA4J8AAOABa1YUWAEAAADgmrVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1gAwF+RXAAGuMmXKAAAAAElFTkSuQmCC';
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  const forum = process.env.TIEBA_FORUM || '数字化管理师';
  await page.goto('https://tieba.baidu.com/f?kw=' + encodeURIComponent(forum), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  const addBtn = await page.evaluate(() => {
    const el = document.querySelector('.add-post');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(addBtn.x, addBtn.y);
  await page.waitForTimeout(5000);

  // 填标题正文，保证上下文真实
  await page.locator('.ql-editor[data-placeholder*="标题"]').first().fill('图片上传通道验证');
  await page.locator('.ql-editor[data-placeholder*="正文"]').first().fill('验证图片上传通道的测试内容。');

  const png = path.join(__dirname, 'tmp-upload.png');
  makePng(png);

  // 点击「图片」按钮 + 拦截 filechooser
  console.log('点击「图片」按钮并等待 filechooser...');
  const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.action-btn, button, [class*="btn"], div, span')]
      .find((el) => (el.textContent || '').trim() === '图片' && el.children.length <= 1);
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('按钮点击:', clicked);
  const chooser = await chooserP;
  console.log('filechooser 触发:', !!chooser);
  if (!chooser) { await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-upload-nochooser.png') }); process.exit(1); }

  console.log(' chooser 背后元素:', await chooser.element().evaluate((el) => ({ cls: el.className, accept: el.accept, multiple: el.multiple })));
  await chooser.setFiles([png]);
  console.log('已 setFiles，等待上传...');

  await page.waitForTimeout(8000);

  const state = await page.evaluate(() => {
    const qe = document.querySelector('.ql-editor[data-placeholder*="正文"]');
    const allImgs = [...document.querySelectorAll('img')].map((i) => ({ src: i.src.slice(0, 90), cls: i.className, inEditor: !!qe.contains(i) }));
    return {
      editorImgs: qe ? qe.querySelectorAll('img').length : -1,
      editorText: qe ? (qe.innerText || '').trim().slice(0, 60) : null,
      totalImgs: allImgs.length,
      imgs: allImgs.slice(0, 10),
      videoModal: !!([...document.querySelectorAll('*')].find((el) => (el.textContent || '').trim() === '上传视频封面' && el.children.length === 0 && el.offsetParent)),
    };
  });
  console.log('\n编辑器图片数:', state.editorImgs);
  console.log('编辑器文本:', state.editorText);
  console.log('视频封面弹窗出现:', state.videoModal);
  console.log('全页 img:', JSON.stringify(state.imgs, null, 1));

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-upload.png') });
  await page.close();
  console.log('\n完成（页面已关闭，未提交）');
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
