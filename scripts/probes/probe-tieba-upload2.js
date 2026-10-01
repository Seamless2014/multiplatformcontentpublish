/* 探测2：真实图片 + 网络监听，确认贴吧图片上传请求与结果落点 */
const path = require('path');
const fs = require('fs');
const bm = require(path.join(__dirname, '..', '..', 'src', 'core', 'browser'));

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // 网络监听：上传相关请求
  const netLog = [];
  page.on('response', (res) => {
    const u = res.url();
    if (/upload|img|pic|poster/i.test(u) && !/\.(js|css|woff|png$)/.test(u.split('?')[0])) {
      if (/tieba|baidu|bcebos/.test(u)) netLog.push({ status: res.status(), url: u.slice(0, 130) });
    }
  });

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

  await page.locator('.ql-editor[data-placeholder*="标题"]').first().fill('图片上传通道验证2');
  await page.locator('.ql-editor[data-placeholder*="正文"]').first().fill('验证图片上传通道的第二轮测试。');

  // 用真实尺寸图片（百度 logo，约 3KB）
  const png = path.join(__dirname, 'tmp-upload2.png');
  const res = await fetch('https://www.baidu.com/img/flexible/logo/pc/result.png');
  fs.writeFileSync(png, Buffer.from(await res.arrayBuffer()));
  console.log('测试图大小:', fs.statSync(png).size, 'bytes');

  const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.action-btn, button, [class*="btn"], div, span')]
      .find((el) => (el.textContent || '').trim() === '图片' && el.children.length <= 1);
    btn.click();
  });
  const chooser = await chooserP;
  if (!chooser) { console.log('filechooser 未触发'); process.exit(1); }
  await chooser.setFiles([png]);
  console.log('已 setFiles，等待 15s...');

  await page.waitForTimeout(15000);

  const state = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('div')].find((el) => (el.textContent || '').includes('发布到吧') && el.className && /modal|dialog|wrap/i.test(el.className.toString())) || document.body;
    const editor = document.querySelector('.ql-editor[data-placeholder*="正文"]');
    // 编辑器外、弹窗内找图片预览结构
    const previews = [...dlg.querySelectorAll('[class*="img"], [class*="pic"], [class*="upload"]')]
      .filter((el) => el.children.length || el.querySelector('img'))
      .slice(0, 15)
      .map((el) => ({ cls: (el.className || '').toString().slice(0, 70), imgs: el.querySelectorAll('img').length, html: el.outerHTML.slice(0, 200) }));
    return {
      editorImgs: editor ? editor.querySelectorAll('img').length : -1,
      editorTextLen: editor ? (editor.innerText || '').trim().length : -1,
      editorHtml: editor ? editor.innerHTML.slice(0, 300) : null,
      previews,
    };
  });

  console.log('\n编辑器图片数:', state.editorImgs, '| 文字:', state.editorTextLen);
  console.log('编辑器HTML:', state.editorHtml);
  console.log('\n弹窗内 img/pic/upload 相关元素:');
  for (const p of state.previews) console.log(`  [${p.cls}] imgs=${p.imgs}\n    ${p.html.replace(/\n/g, ' ').slice(0, 180)}`);

  console.log('\n网络请求（upload/img/pic 相关）:');
  for (const n of netLog.slice(0, 20)) console.log(`  ${n.status} ${n.url}`);

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'screenshots', 'probe-tieba-upload2.png') });
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
