const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const client = await ctx.newCDPSession(page);
  const snap = await client.send('DOMSnapshot.captureSnapshot', { computedStyles: [] });
  const { strings, documents } = snap;

  // 全局搜字符串表
  const hits = [];
  strings.forEach((s, i) => { if (s && (s.includes('暂存') || s === '发布')) hits.push(i + ': "' + s.slice(0, 40) + '"'); });
  console.log('字符串表中「暂存/发布」: ' + hits.length);
  for (const h of hits.slice(0, 20)) console.log('  ' + h);

  // 文档数量与节点数
  for (const doc of documents) {
    console.log('\ndoc: nodes=' + doc.nodes.nodeName.length + ' layout=' + doc.layout.nodeIndex.length);
  }

  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
