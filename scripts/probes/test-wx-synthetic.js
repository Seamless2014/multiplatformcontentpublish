/**
 * 实测：filetransfer 上传拿 CDN → 模仿编辑器原生 section 结构插入 PM。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();

  // 1) 清空正文（PM#1 全选删除）
  await page.locator('.ProseMirror').nth(1).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  console.log('正文已清空');

  // 2) filetransfer 上传拿 CDN + 3) 原生结构插入
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAaklEQVR42u3QMQEAAAgDoJnc6BpjDyRg0FctAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFPoAABlfXjXwAAAABJRU5ErkJggg==';

  const result = await page.evaluate(async (dataB64) => {
    const cd = window.wx.commonData.data;
    const token = cd.token || (location.href.match(/token=(\d+)/) || [])[1];
    const bytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'image/png' }), 'img.png');
    const url = '/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=' + cd.uin + '_news&ticket=' + cd.ticket + '&svr_time=' + Math.floor(Date.now() / 1000) + '&token=' + token + '&lang=zh_CN';
    const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    const j = await r.json();
    if (!j || j.base_resp.ret !== 0) return { err: 'upload ret=' + (j ? j.base_resp.ret : '?') };
    const cdn = j.cdn_url;

    // 找正文 PM，聚焦光标到末尾，用 beforeinput+insertHTML 插入编辑器原生结构
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const pm = pms[1];
    pm.focus();
    // 光标移到末尾
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const html = '<section style="text-align: center" nodeleaf=""><img src="' + cdn + '" data-src="' + cdn + '" class="rich_pages wxw-img js_insertlocalimg" data-ratio="1" data-s="300,640" data-w="100" type="block" contenteditable="false"></section>';
    const ev = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' });
    pm.dispatchEvent(ev);
    document.execCommand('insertHTML', false, html);
    return { cdn };
  }, b64);

  if (result.err) { console.error('上传失败: ' + result.err); process.exit(1); }
  console.log('上传成功 CDN: ' + result.cdn.slice(0, 80));
  await page.waitForTimeout(2000);

  // 4) 验证
  const check = await page.evaluate(() => {
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const pm = pms[1];
    const imgs = [...pm.querySelectorAll('img')].filter((i) => !i.className.includes('separator'));
    return { count: imgs.length, srcs: imgs.map((i) => i.src.slice(0, 80)), pmHTML: pm.innerHTML.slice(0, 600) };
  });
  console.log('\n正文 img: ' + check.count);
  for (const s of check.srcs) console.log('  ' + s);
  await page.screenshot({ path: 'screenshots/probe-wx-synthetic.png' });
  console.log('\n截图: probe-wx-synthetic.png');
  console.log('\nPM HTML 前 600 字:\n' + check.pmHTML);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
