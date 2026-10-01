/**
 * 串行发布队列：一篇文章 × 多平台 = 多个子任务，依次执行（共用同一浏览器，避免并发风控）
 * 任务持久化到 data/tasks.json，重启不丢记录。
 */
const fs = require('fs');
const path = require('path');
const adapters = require('../adapters');
const browserMgr = require('./browser');

const TASKS_FILE = path.join(__dirname, '..', '..', 'data', 'tasks.json');

let tasks = [];
if (fs.existsSync(TASKS_FILE)) {
  try { tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); } catch { tasks = []; }
}

let running = false;

function save() {
  try {
    fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
  } catch { /* 忽略持久化失败 */ }
}

function createTask({ title, platform, mode, articleFile }) {
  const t = {
    id: `${Date.now()}-${platform}`,
    title, platform, mode, articleFile,
    status: 'pending', // pending | running | success | failed
    message: '', url: null, screenshot: null,
    createdAt: new Date().toISOString(), finishedAt: null,
  };
  tasks.unshift(t);
  save();
  return t;
}

/** 入队后异步逐个执行 */
function drain() {
  if (running) return;
  const next = tasks.find((t) => t.status === 'pending');
  if (!next) return;
  running = true;
  run(next).finally(() => { running = false; setImmediate(drain); });
}

async function run(task) {
  task.status = 'running';
  task.logs = [];
  save();
  const adapter = adapters[task.platform];
  if (!adapter) { task.status = 'failed'; task.message = '未知平台'; save(); return; }
  const log = (m) => {
    task.message = m;
    task.logs.push(`${new Date().toLocaleTimeString('zh-CN')} ${m}`);
    if (task.logs.length > 40) task.logs.shift();
    save();
  };
  try {
    const context = browserMgr.getContext();
    const result = await adapter.publish(context, task._article, task.mode, log);
    task.status = result.ok ? 'success' : 'failed';
    task.message = result.message || task.message;
    task.logs.push(`${new Date().toLocaleTimeString('zh-CN')} 结果：${task.message}`);
    task.url = result.url || null;
    task.screenshot = result.screenshot || null;
  } catch (e) {
    task.status = 'failed';
    task.message = e.message.split('\n')[0];
    task.logs.push(`${new Date().toLocaleTimeString('zh-CN')} 失败：${task.message}`);
  }
  task.finishedAt = new Date().toISOString();
  save();
}

function enqueue({ title, content, platforms, mode, forum }) {
  // 文章落盘（forum 作为元信息写入首行，retry 时恢复）
  const articleFile = path.join(__dirname, '..', '..', 'articles', `${Date.now()}.md`);
  fs.mkdirSync(path.dirname(articleFile), { recursive: true });
  fs.writeFileSync(articleFile, (forum ? `<!-- forum: ${forum} -->\n` : '') + `# ${title}\n\n${content}`);

  const created = platforms.map((p) => {
    const t = createTask({ title, platform: p, mode, articleFile });
    t._article = { title, content, images: [], forum: forum || '' };
    return t;
  });
  setImmediate(drain);
  return created.map(({ _article, ...t }) => t);
}

/** 重试失败任务 */
async function retry(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return null;
  if (!t.articleFile) return t;
  const md = fs.readFileSync(t.articleFile, 'utf8');
  const fm = md.match(/^<!-- forum: (.+) -->\n/);
  const forum = fm ? fm[1].trim() : '';
  const mdBody = fm ? md.slice(fm[0].length) : md;
  const m = mdBody.match(/^# (.+)\n\n([\s\S]*)$/);
  t._article = { title: m ? m[1] : t.title, content: m ? m[2] : mdBody, images: [], forum };
  t.status = 'pending'; t.message = ''; t.finishedAt = null;
  save();
  setImmediate(drain);
  return t;
}

function list() { return tasks.map(({ _article, ...t }) => t); }
function clearFinished() {
  tasks = tasks.filter((t) => t.status === 'pending' || t.status === 'running');
  save();
}

module.exports = { enqueue, retry, list, clearFinished };
