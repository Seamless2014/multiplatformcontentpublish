const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const n = await page.locator('xhs-publish-btn').count();
  console.log('xhs-publish-btn 数量: ' + n);
  for (let i = 0; i < n; i++) {
    const bb = await page.locator('xhs-publish-btn').nth(i).boundingBox().catch(() => null);
    console.log('  #' + i + ' boundingBox=' + JSON.stringify(bb));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
