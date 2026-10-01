/**
 * 微信合成方案重试：刷新页面 → filetransfer 上传 → 编辑器原生 section 结构插入 PM。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  await page.bringToFront();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

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
    if (!j || j.base_resp.ret !== 0) return { err: 'ret=' + (j ? j.base_resp.ret : '?') + ' msg=' + (j ? j.base_resp.err_msg : '?') };
    const cdn = j.cdn_url;
    const pms = [...document.querySelectorAll('.ProseMirror')];
    const pm = pms[1];
    pm.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(pm);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const html = '<section style="text-align: center" nodeleaf=""><img src="' + cdn + '" data-src="' + cdn + '" class="rich_pages wxw-img js_insertlocalimg" data-ratio="1" data-s="300,640" data-w="100" type="block" contenteditable="false"></section>';
    pm.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
    document.execCommand('insertHTML', false, html);
    return { cdn };
  }, b64);

  if (result.err) { console.error('失败: ' + result.err); process.exit(1); }
  console.log('CDN: ' + result.cdn.slice(0, 80));
  await page.waitForTimeout(2500);
  const check = await page.evaluate(() => {
    const pm = [...document.querySelectorAll('.ProseMirror')][1];
    const imgs = [...pm.querySelectorAll('img')].filter((i) => !i.className.includes('separator'));
    return { count: imgs.length, srcs: imgs.map((i) => i.src.slice(0, 70)) };
  });
  console.log('正文 img: ' + check.count);
  for (const s of check.srcs) console.log('  ' + s);
  const path = require('path');
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'probe-wx-synthetic2.png') });
  console.log('截图: probe-wx-synthetic2.png');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
