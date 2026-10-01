const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const attempts = [
    ['text=暂存离开', 'text=暂存离开'],
    ['getByText', null],
    ['css pierce: xhs-publish-btn span', 'xhs-publish-btn span'],
    ['xhs-publish-btn *', 'xhs-publish-btn *'],
  ];
  for (const [label, sel] of attempts) {
    try {
      let n;
      if (label === 'getByText') n = await page.getByText('暂存离开').count();
      else n = await page.locator(sel).count();
      console.log(label + ' → count=' + n);
      if (n > 0) {
        for (let i = 0; i < Math.min(n, 5); i++) {
          const bb = await (label === 'getByText' ? page.getByText('暂存离开').nth(i) : page.locator(sel).nth(i)).boundingBox().catch(() => null);
          const txt = await (label === 'getByText' ? page.getByText('暂存离开').nth(i) : page.locator(sel).nth(i)).innerText().catch(() => '<无法取文本>');
          console.log('   #' + i + ' text="' + String(txt).slice(0, 20) + '" box=' + JSON.stringify(bb));
        }
      }
    } catch (e) { console.log(label + ' → ERR ' + e.message.slice(0, 80)); }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
