const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().filter((p) => /mp\.weixin\.qq\.com/.test(p.url())).pop();
  if (!page) { console.error('no weixin page'); process.exit(1); }
  await page.bringToFront();

  const info = await page.evaluate(() => {
    const out = { url: location.href.slice(0, 80), hasWx: typeof window.wx !== 'undefined', commonData: null, ticketKeys: [] };
    try {
      const cd = window.wx && window.wx.commonData && window.wx.commonData.data;
      if (cd) {
        out.commonData = {
          token: cd.token, appid: cd.appid, uin: cd.uin, nick_name: cd.nick_name,
          tickets: cd.tickets, ticket: cd.ticket, ticket_id: cd.ticket_id,
        };
      }
    } catch (e) { out.commonData = 'ERR ' + e.message; }
    // 全局搜 ticket 相关变量
    try {
      for (const k of Object.keys(window)) {
        if (/ticket/i.test(k)) out.ticketKeys.push(k);
      }
    } catch (e) { /* ignore */ }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
