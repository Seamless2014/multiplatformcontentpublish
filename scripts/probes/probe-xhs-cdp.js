const bm = require('../src/core/browser');
(async () => {
  await bm.connect();
  const ctx = bm.getContext();
  const page = ctx.pages().find((p) => /creator\.xiaohongshu\.com\/publish/.test(p.url()));
  if (!page) { console.error('no page'); process.exit(1); }
  await page.bringToFront();

  const client = await ctx.newCDPSession(page);

  // 找到 xhs-publish-btn 的 backendNodeId
  const doc = await client.send('DOM.getDocument', { pierce: true, depth: -1 });
  let found = [];
  const walk = (node, path) => {
    if (!node) return;
    const p = path + '/' + (node.nodeName || '?');
    if (/XHS-PUBLISH-BTN/i.test(node.nodeName || '')) found.push({ id: node.nodeId, path: p, name: node.nodeName });
    for (const c of node.children || []) walk(c, p);
    for (const c of node.shadowRoots || []) walk(c, p + '[shadow]');
    if (node.contentDocument) walk(node.contentDocument, p + '[doc]');
    if (node.templateContent) walk(node.templateContent, p + '[tpl]');
  };
  walk(doc.root, '');

  console.log('找到 xhs-publish-btn 节点: ' + found.length);
  if (!found.length) {
    // debug: 打印根节点前几个子树名
    const tops = (doc.root.children || []).map((c) => c.nodeName);
    console.log('顶层: ' + tops.join(', '));
    process.exit(1);
  }

  // 对每个 host 拿 flatten 后代 + 文本
  for (const f of found) {
    console.log('\n=== host nodeId=' + f.id + ' path=' + f.path.slice(0, 120));
    const flat = await client.send('DOM.getFlattenedDocument', { depth: -1, pierce: true });
    // 找到该 host 子树（简单方式：重新遍历 flat 列表构建父子映射）
    const byId = new Map();
    for (const n of flat.nodes) byId.set(n.nodeId, n);
    // BFS 从 host 开始
    const collect = (rootId) => {
      const out = [];
      const stack = [rootId];
      const seen = new Set();
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const n = byId.get(id);
        if (!n) continue;
        out.push(n);
        for (const c of n.children || []) stack.push(c.nodeId);
        for (const c of n.shadowRoots || []) stack.push(c.nodeId);
        if (n.contentDocument) stack.push(n.contentDocument.nodeId);
      }
      return out;
    };
    const sub = collect(f.id);
    console.log('子树节点数: ' + sub.length);
    // 打印含文本的节点与按钮类节点
    for (const n of sub) {
      const txt = (n.nodeValue || '').trim();
      const isBtn = /button|btn/i.test(n.nodeName) || (n.attributes || []).join(' ').match(/class="([^"]*btn[^"]*)"/i);
      if (txt && txt.length < 30) {
        console.log('  <' + n.nodeName + '> text="' + txt + '" nodeId=' + n.nodeId);
      } else if (isBtn) {
        const cls = ((n.attributes || []).join(' ').match(/class="([^"]*)"/i) || [])[1] || '';
        console.log('  <' + n.nodeName + '> cls="' + cls.slice(0, 60) + '" nodeId=' + n.nodeId);
      }
    }
  }

  await client.detach().catch(() => {});
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
