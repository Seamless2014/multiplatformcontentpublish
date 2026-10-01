/**
 * 多平台图文发布器 · 服务端
 * 端口默认 8800：node server.js  （或 CDP_URL=... node server.js）
 */
const express = require('express');
const path = require('path');
const browserMgr = require('./src/core/browser');
const adapters = require('./src/adapters');
const { RULES, validateAll, textLen } = require('./src/core/rules');
const { extractImages } = require('./src/core/article');
const queue = require('./src/core/queue');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

const PORT = process.env.PORT || 8800;

// ---------- 全局兜底：任何异常都不允许让服务进程退出 ----------
// 教训：browserContext.newPage 在浏览器被关闭时会抛错，
// 若未被捕获会以 unhandledRejection 形式直接终止 Node 进程。
process.on('unhandledRejection', (err) => {
  console.error('[未捕获的 Promise 异常，已拦截]', err && err.message ? err.message : err);
});
process.on('uncaughtException', (err) => {
  console.error('[未捕获的异常，已拦截]', err && err.message ? err.message : err);
});

/** 统一包装异步路由：区分「浏览器未连接/断开」（400，客户端状态问题）
 *  与「真正的服务端异常」（500），避免把可预期的状态问题报成服务故障 */
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    const msg = (e && e.message ? e.message : String(e)).split('\n')[0];
    const isConnIssue = /未连接|连接已断开|浏览器可能被关闭/.test(msg);
    if (isConnIssue) {
      if (!res.headersSent) res.status(400).json({ error: msg, needReconnect: true });
      return;
    }
    console.error(`[路由异常] ${req.method} ${req.path}:`, msg);
    if (!res.headersSent) res.status(500).json({ error: msg });
  });
};

// 平台元信息（给前端渲染勾选列表）
app.get('/api/platforms', (_req, res) => {
  res.json(Object.entries(RULES).map(([id, r]) => ({ id, name: r.name, title: r.title, content: r.content })));
});

// 浏览器连接状态
app.get('/api/status', wrap(async (_req, res) => res.json(await browserMgr.status())));

// 连接失败时的完整诊断
app.get('/api/diagnose', wrap(async (_req, res) => res.json(await browserMgr.diagnose())));

// 连接浏览器（CDP）
app.post('/api/connect', async (req, res) => {
  try { res.json(await browserMgr.connect(req.body && req.body.cdpUrl)); }
  catch (e) { res.status(400).json({ error: e.message, hint: '可调用 /api/diagnose 查看具体原因' }); }
});

// 断开
app.post('/api/disconnect', wrap(async (_req, res) => { await browserMgr.disconnect(); res.json({ ok: true }); }));

// 拉起带调试端口的浏览器
// body: { browser:'chrome'|'edge', profileMode:'separate'|'current' }
app.post('/api/launch-browser', wrap(async (req, res) => {
  const b = req.body || {};
  res.json(await browserMgr.launchBrowser(b.browser || 'chrome', b.profileMode || 'separate'));
}));

// 各平台登录态检测（须已连接）
// 逐平台隔离：单平台异常不影响其他平台，也不会让服务崩溃
app.get('/api/check-login', wrap(async (_req, res) => {
  if (!browserMgr.isConnected()) return res.status(400).json({ error: '浏览器未连接' });
  const context = browserMgr.getContext();
  const out = {};
  for (const [id, adapter] of Object.entries(adapters)) {
    try {
      out[id] = await adapter.checkLogin(context);
    } catch (e) {
      out[id] = { ok: false, message: `检测异常：${e.message.split('\n')[0]}` };
    }
  }
  res.json(out);
}));

// 发布前校验
app.post('/api/validate', (req, res) => {
  const { title = '', content = '', platforms = [], forum = '' } = req.body || {};
  const article = { title, content, images: extractImages(content), forum };
  res.json(validateAll(platforms, article));
});

// 入队发布
app.post('/api/publish', (req, res) => {
  const { title = '', content = '', platforms = [], mode = 'draft', forum = '' } = req.body || {};
  if (!title.trim()) return res.status(400).json({ error: '标题不能为空' });
  if (!content.trim()) return res.status(400).json({ error: '正文不能为空' });
  if (!platforms.length) return res.status(400).json({ error: '请至少选择一个平台' });
  if (platforms.includes('tieba') && !forum.trim()) return res.status(400).json({ error: '发布到百度贴吧需填写目标吧名（forum）' });
  if (!browserMgr.isConnected()) return res.status(400).json({ error: '浏览器未连接，请先连接' });

  const err = validateAll(platforms, { title, content, images: extractImages(content), forum });
  const blocked = Object.entries(err).filter(([, items]) => items.some((i) => i.level === 'error'));
  if (blocked.length) {
    return res.status(400).json({
      error: '存在阻断性校验问题',
      detail: Object.fromEntries(blocked),
    });
  }
  const tasks = queue.enqueue({ title, content, platforms, mode, forum: forum.trim() });
  res.json({ ok: true, tasks });
});

app.get('/api/tasks', (_req, res) => res.json(queue.list()));
app.post('/api/tasks/:id/retry', wrap(async (req, res) => res.json((await queue.retry(req.params.id)) || { error: '任务不存在' })));
app.post('/api/tasks/clear', (_req, res) => { queue.clearFinished(); res.json({ ok: true }); });

app.listen(PORT, () => {
  console.log(`多平台发布器已启动: http://localhost:${PORT}`);
  console.log(`CDP 调试端口: ${browserMgr.CDP_URL}（浏览器需以 --remote-debugging-port=9222 启动）`);
});
