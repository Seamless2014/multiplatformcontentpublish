/**
 * 实测：在微信编辑器页面上下文调用 filetransfer 上传图片素材。
 * 成功则返回 mmbiz.qpic.cn CDN 地址。
 */
const bm = require('../src/core/browser');

(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();

  // 1x1 红色 PNG base64（无跨域问题，纯字节）
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const result = await page.evaluate(async (dataB64) => {
    const cd = window.wx.commonData.data;
    const token = cd.token || (location.href.match(/token=(\d+)/) || [])[1];
    const bytes = Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'image/png' }), 'test.png');
    const url = '/cgi-bin/filetransfer?action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1&ticket_id=' + cd.uin + '_news&ticket=' + cd.ticket + '&svr_time=' + Math.floor(Date.now() / 1000) + '&token=' + token + '&lang=zh_CN';
    const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include' });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { /* raw */ }
    return { status: r.status, body: txt.slice(0, 500), json: j };
  }, b64);

  console.log('HTTP ' + result.status);
  console.log('body: ' + result.body);
  if (result.json && result.json.content) console.log('\n★ CDN URL: ' + result.json.content);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
