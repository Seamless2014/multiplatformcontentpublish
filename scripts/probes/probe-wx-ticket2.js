const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  await page.bringToFront();
  const info = await page.evaluate(() => {
    const cd = window.wx.commonData.data;
    return {
      ticket: cd.ticket ? cd.ticket.slice(0, 12) + '...' : null,
      uin: cd.uin,
      token: cd.token,
      svrTimeHint: Math.floor(Date.now() / 1000),
      otherFields: Object.keys(cd).filter((k) => /ticket|pass|key|token/i.test(k)).map((k) => k + '=' + String(cd[k]).slice(0, 20)),
    };
  });
  console.log(JSON.stringify(info, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
