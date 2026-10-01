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
  const doc = documents[0];
  const { nodes, layout } = doc;

  // 找到文本节点的标准方式：nodes.layoutNodeIndex? 不 —— 文本框在 layout.textBoxes
  // 先看 textValue 有多少节点有值
  let tvCount = 0;
  for (let i = 0; i < nodes.textValue.length; i++) {
    if (nodes.textValue[i] && nodes.textValue[i].value >= 0) tvCount++;
  }
  console.log('有 textValue 的节点数: ' + tvCount + ' / 总节点 ' + nodes.nodeName.length);

  // 打印所有 textValue 非空的节点文本（前 40 个），看文本节点是否被快照
  let printed = 0;
  for (let i = 0; i < nodes.textValue.length && printed < 40; i++) {
    const v = nodes.textValue[i];
    if (v && v.value >= 0) {
      console.log('  node#' + i + ' <' + strings[nodes.nodeName[i]] + '> "' + strings[v.value].slice(0, 30) + '"');
      printed++;
    }
  }

  // nodeValue 字段？（老版本字段名）
  if (nodes.nodeValue) {
    let nv = 0;
    for (let i = 0; i < nodes.nodeValue.length; i++) {
      if (nodes.nodeValue[i] >= 0) nv++;
    }
    console.log('\nnodeValue 非空数: ' + nv);
    for (let i = 0; i < nodes.nodeValue.length; i++) {
      const vi = nodes.nodeValue[i];
      if (vi >= 0 && (strings[vi] === '暂存离开' || strings[vi] === '发布')) {
        console.log('  ★ node#' + i + ' <' + strings[nodes.nodeName[i]] + '> "' + strings[vi] + '"');
      }
    }
  }
  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
