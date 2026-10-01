/* 多平台图文发布器 · 前端逻辑 */
const $ = (sel) => document.querySelector(sel);
let platforms = [];

// ---------- 初始化 ----------
async function init() {
  const res = await fetch('/api/platforms');
  platforms = await res.json();
  renderPlatforms();
  refreshStatus();
  setInterval(refreshTasks, 2500);
  refreshTasks();
  $('#content').addEventListener('input', updateCount);
  $('#title').addEventListener('input', updateCount);
  updateCount();
}

function renderPlatforms() {
  $('#platforms').innerHTML = platforms.map((p) => {
    const t = p.title && p.title.max ? `标题 ${p.title.min || 1}~${p.title.max}` : '';
    const c = p.content && p.content.max ? `正文≤${p.content.max}` : '';
    return `<label><input type="checkbox" value="${p.id}" checked>
      <span>${p.name}</span><span class="rule">${[t, c].filter(Boolean).join(' · ')}</span></label>`;
  }).join('');
  $('#platforms').querySelectorAll('input').forEach((el) => el.addEventListener('change', debounceValidate));
  $('#platforms').querySelectorAll('input').forEach((el) => el.addEventListener('change', toggleForum));
}

/** 选中贴吧时显示吧名输入框 */
function toggleForum() {
  const sel = [...$('#platforms').querySelectorAll('input:checked')].map((i) => i.value);
  $('#forum').style.display = sel.includes('tieba') ? 'block' : 'none';
}

function updateCount() {
  const t = $('#title').value.replace(/\s/g, '').length;
  const c = $('#content').value.replace(/\s/g, '').length;
  $('#count').textContent = `标题 ${t} 字 · 正文 ${c} 字`;
  debounceValidate();
}

// ---------- 浏览器连接 ----------
async function refreshStatus() {
  const s = await (await fetch('/api/status')).json();
  setConn(s.connected, s.portOpen ? '端口已开' : '端口未开');
}

function setConn(connected, text) {
  $('#conn-state').className = `dot ${connected ? 'on' : 'off'}`;
  $('#conn-text').textContent = connected ? '已连接' : text;
}

function showHint(msg, autoHide) {
  const el = $('#hint');
  el.textContent = msg;
  el.classList.remove('hidden');
  if (autoHide) setTimeout(() => el.classList.add('hidden'), 8000);
}

$('#btn-connect').addEventListener('click', async () => {
  showHint('正在连接 127.0.0.1:9222 ...（连接失败会自动给出诊断）');
  const r = await (await fetch('/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  if (r.error) {
    setConn(false, '连接失败');
    await showDiagnose();
    return;
  }
  setConn(true);
  showHint('已连接浏览器。建议先点「检测登录态」确认各平台登录情况。', true);
});

$('#btn-launch').addEventListener('click', async () => {
  const mode = $('#profile-mode').value;
  showHint(`正在拉起浏览器（${mode === 'separate' ? '独立 profile，不影响你正在用的浏览器' : '复用日常 profile，需先完全退出浏览器'}）...`);
  const r = await (await fetch('/api/launch-browser', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browser: 'chrome', profileMode: mode }),
  })).json();
  if (!r.ok) { await showDiagnose(r.message); return; }
  showHint(r.message, true);
  await refreshStatus();
});

$('#btn-diag').addEventListener('click', () => showDiagnose());

async function showDiagnose(extra) {
  const d = await (await fetch('/api/diagnose')).json();
  $('#diag-panel').classList.remove('hidden');
  const levelClass = { ok: 'ok', ready: 'ok', warn: 'warn', block: 'no' }[d.verdict.level] || 'no';
  $('#diag-body').innerHTML = `
    <div class="login-badge ${levelClass}" style="display:block;margin-bottom:8px">${escapeHtml(d.verdict.text)}</div>
    <table class="diag-table">
      <tr><td>调试端口</td><td>${d.cdpUrl} · ${d.portOpen ? '已监听' : '未监听'}</td></tr>
      <tr><td>浏览器版本</td><td>${d.browser || '—'}</td></tr>
      <tr><td>已连接</td><td>${d.connected ? '是' : '否'}</td></tr>
      <tr><td>运行中的 Chrome</td><td>${d.chromeRunning} 个</td></tr>
      <tr><td>运行中的 Edge</td><td>${d.edgeRunning} 个</td></tr>
      <tr><td>带调试端口的进程</td><td>${d.processesWithDebugPort.length ? escapeHtml(d.processesWithDebugPort.join('；')) : '无'}</td></tr>
      ${extra ? `<tr><td>本次操作</td><td>${escapeHtml(extra)}</td></tr>` : ''}
    </table>`;
}

$('#btn-check').addEventListener('click', async () => {
  showHint('正在逐平台检测登录态（会依次打开各平台后台）...');
  const res = await fetch('/api/check-login');
  const r = await res.json();
  if (r.error) {
    setConn(false, r.needReconnect ? '连接已断开' : '检测失败');
    showHint(r.needReconnect ? `${r.error}（请重新点「连接浏览器」）` : r.error);
    return;
  }
  $('#login-panel').classList.remove('hidden');
  $('#login-list').innerHTML = Object.entries(r).map(([id, v]) => {
    const p = platforms.find((x) => x.id === id);
    return `<span class="login-badge ${v.ok ? 'ok' : 'no'}" title="${v.message}">${p ? p.name : id}：${v.ok ? '已登录' : v.message}</span>`;
  }).join('');
  const okCount = Object.values(r).filter((v) => v.ok).length;
  showHint(`登录态检测完成：${okCount}/${Object.keys(r).length} 个平台已登录`, true);
});

// ---------- 校验 ----------
let validateTimer;
function debounceValidate() {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(doValidate, 600);
}

function doValidate() {
  const sel = [...$('#platforms').querySelectorAll('input:checked')].map((i) => i.value);
  if (!sel.length) { $('#validate-result').innerHTML = ''; return; }
  fetch('/api/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: $('#title').value, content: $('#content').value, platforms: sel, forum: $('#forum').value }),
  }).then((r) => r.json()).then((r) => {
    $('#validate-result').innerHTML = Object.entries(r).flatMap(([p, items]) =>
      items.map((i) => `<div class="item ${i.level}">【${platformName(p)}】${i.level === 'error' ? '✕' : '⚠'} ${i.message}</div>`)).join('');
  }).catch(() => {});
}

function platformName(id) { const p = platforms.find((x) => x.id === id); return p ? p.name : id; }

// ---------- 发布 ----------
$('#btn-publish').addEventListener('click', async () => {
  const platformsSel = [...$('#platforms').querySelectorAll('input:checked')].map((i) => i.value);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const body = { title: $('#title').value, content: $('#content').value, platforms: platformsSel, mode, forum: $('#forum').value };
  const res = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const r = await res.json();
  if (r.error) {
    let msg = r.error;
    if (r.detail) msg += '\n' + Object.entries(r.detail).map(([p, items]) => `【${platformName(p)}】` + items.map((i) => i.message).join('；')).join('\n');
    alert(msg);
    return;
  }
  showHint(`已入队 ${r.tasks.length} 个发布任务，执行中（串行，请勿关闭浏览器）`, true);
  refreshTasks();
});

// ---------- 任务列表 ----------
async function refreshTasks() {
  const tasks = await (await fetch('/api/tasks')).json();
  const el = $('#tasks');
  if (!tasks.length) { el.innerHTML = '<p class="muted">暂无任务</p>'; return; }
  el.innerHTML = tasks.map((t) => {
    const st = { pending: '排队中', running: '执行中', success: '成功', failed: '失败' }[t.status];
    const link = t.url && t.status === 'success' ? ` <a href="${t.url}" target="_blank">查看</a>` : '';
    const shot = t.screenshot ? ` <a href="/screenshots/${t.screenshot}" target="_blank">截图</a>` : '';
    const retry = (t.status === 'failed') ? `<span class="retry" onclick="retryTask('${t.id}')">重试</span>` : '';
    const logs = (t.logs && t.logs.length)
      ? `<details class="logs"><summary>日志 ${t.logs.length} 条</summary>${t.logs.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</details>`
      : '';
    return `<div class="task">
      <div class="row1"><span class="platform">${platformName(t.platform)}</span>
        <span class="muted">${t.mode === 'publish' ? '直接发布' : '草稿'}</span>
        <span class="status ${t.status}">${st}</span></div>
      <div class="msg">${escapeHtml(t.message || t.title || '')}${link}${shot}${retry}</div>
      ${logs}
    </div>`;
  }).join('');
}

async function retryTask(id) {
  await fetch(`/api/tasks/${id}/retry`, { method: 'POST' });
  refreshTasks();
}

$('#btn-clear').addEventListener('click', async () => { await fetch('/api/tasks/clear', { method: 'POST' }); refreshTasks(); });

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

init();
