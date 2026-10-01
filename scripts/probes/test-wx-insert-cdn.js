/**
 * 单独验证插入：用已有 CDN URL 模仿编辑器原生 section 结构插入 PM。
 */
const bm = require('../src/core/browser');

const CDN = 'https://mmbiz.qpic.cn/sz_mmbiz_png/hsD4icaoMO7icx9hSgLWSnTwtcUicG2cXMgfMaPMkDYsQra1gyZRPGlQ8vRP3EAw5YRJbf6on7LJJIZBghSSHaV844MiaE9WyTNyNNdMzuptJ6I/0?wx_fmt=png&from=appmsg';

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  await page.bringToFront();

  // 光标入正文末尾（先点真实位置）
  const pmLoc = page.locator('.ProseMirror').nth(1);
  await pmLoc.click();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(400);

  // 插入编辑器原生 section 结构
  const r = await page.evaluate((cdnUrl) => {
    const pm = [...document.querySelectorAll('.ProseMirror')][1];
    pm.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const esc = cdnUrl.replace(/&/g, '&amp;');
    const html = '<section style="text-align: center" nodeleaf=""><img src="' + esc + '" data-src="' + esc + '" class="rich_pages wxw-img js_insertlocalimg" data-ratio="1" data-s="300,640" data-w="100" type="block" contenteditable="false"></section>';
    pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
    document.execCommand('insertHTML', false, html);
    return true;
  }, CDN);
  console.log('插入指令已执行');
  await page.waitForTimeout(2500);

  const check = await page.evaluate(() => {
    const pm = [...document.querySelectorAll('.ProseMirror')][1];
    const imgs = [...pm.querySelectorAll('img')].filter((i) => !i.className.includes('separator'));
    return { count: imgs.length, srcs: imgs.map((i) => i.src.slice(0, 75)), html: pm.innerHTML.slice(0, 400) };
  });
  console.log('正文 img: ' + check.count);
  for (const s of check.srcs) console.log('  ' + s);
  const path = require('path');
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-wx-insert-cdn.png') });
  console.log('截图: probe-wx-insert-cdn.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
