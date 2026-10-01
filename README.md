# 多平台图文发布器（multi-publisher）

一次编辑，把图文文章分发到 **微信公众号 / 今日头条 / 知乎 / 百家号 / 小红书 / 百度贴吧 / 新浪微博**（其他平台可按同一适配器模板横向扩展）。

技术路线：**Node.js + Playwright（CDP 直连日常浏览器）**，复用浏览器里已登录的各平台会话，不解密 cookie、不碰各平台签名风控。

> 📖 **第一次使用？先看 [`docs/使用说明.md`](docs/使用说明.md)** —— 面向使用者的完整操作手册（环境准备、发布流程、各平台注意事项、常见问题排查）。

## 快速开始

```bash
# 1. 安装依赖（已安装可跳过）
npm install

# 2. 启动服务
node server.js
# 打开 http://localhost:8800

# 3. 一键验证所有环节
node scripts/verify-all.js
```

### 浏览器准备（关键步骤）

程序通过 CDP（调试端口 9222）连接浏览器。页面右上角提供**两种模式**：

| 模式 | 说明 | 前提 |
|------|------|------|
| **独立 profile（默认推荐）** | 用 `data/browser-profile/chrome` 独立目录启动一个专用浏览器，**与你日常使用的 Chrome 互不影响** | 无需任何操作，点「拉起浏览器」即可；但**需在这个专用窗口里登录一次各平台** |
| 复用日常 profile | 直接复用你日常 Chrome 的登录态，无需重新登录 | **必须先完全退出 Chrome**（含托盘图标、后台进程），否则调试参数会被丢弃 |

操作：选好模式 → 点「**拉起浏览器**」→ 等提示端口就绪 → 点「**连接浏览器**」→「**检测登录态**」。
连接失败时点「**诊断**」会给出具体原因（运行中的浏览器数量、带调试端口的进程、profile 模式等）。

> **为什么必须这么做**：Chrome 有单实例机制——浏览器已在运行时，新实例的
> `--remote-debugging-port` 参数会被丢弃；且 Chrome 136+ 起必须显式指定 `--user-data-dir`。
> 另外 profile 目录若残留锁文件（`SingletonLock` 等）会导致启动后立即退出，程序已自动清理。

## 使用流程

1. 左侧输入标题 + 正文（Markdown，图片用 `![说明](https://...)`）
2. 右侧勾选目标平台（自动显示各平台规则校验：标题字数、图片要求等）
3. 选择模式：
   - **保存为草稿（默认推荐）**：只把文章填入各平台编辑器并保存草稿，不对外发布
   - **直接发布**：点击各平台发布按钮（⚠️ 公众号为群发，不可撤回）
4. 点「开始发布」，下方进度面板实时显示各平台结果，失败自动截图（screenshots/ 目录）

## 设计要点

| 模块 | 说明 |
|------|------|
| CDP 连接管理 | `connectOverCDP(127.0.0.1:9222)`，端口探测、自动拉起浏览器、登录态逐平台检测 |
| 规则校验 | 公众号标题≤64 / 头条 5~30 / 知乎≤100 / 百家号 8~30 / 小红书≤20 且正文≤1000 且必须有图 / 贴吧标题 5~31 且需填目标吧名 / 微博正文≤2000（无标题字段） |
| 正文注入 | Markdown→HTML 后走「框架感知注入」：识别 ProseMirror/DraftJS/UEditor/普通编辑器，分别用 `beforeinput`+`execCommand('insertHTML')` 或 `innerHTML` 落地 |
| 图片回填 | 注入前把 `<img>` 换成唯一占位符（`\u2063\u2063IMG_n\u2063\u2063`），文字注入完成后逐张用 `execCommand('insertImage')` 原位替换，失败自动重试并清理残留占位符 |
| 图片转存 | 外链图自动下载转 base64——公众号编辑器会自动转存到素材库并替换为微信 CDN |
| 发布队列 | 多平台串行执行（共用一个浏览器，降低风控），任务持久化到 data/tasks.json，失败可重试 |
| 留证 | 失败任务自动截图，可在进度面板查看 |

## 各平台适配说明

| 平台 | 入口 | 正文方式 | 草稿 | 直接发布 | 真实验证 |
|------|------|----------|------|----------|----------|
| 微信公众号 | 后台取 token → 新图文编辑器(type=77) | 分段注入：文字 insertHTML + 图片走素材库上传(filetransfer)后按编辑器原生 section 结构注入 | 保存为草稿 | 群发（不可撤回） | ✅ PASS（标题/文字/加粗/图 1/1/已保存） |
| 今日头条 | mp.toutiao.com 图文发布页 | keepImages 整体注入（编辑器自动转存上传） | 自动保存（「草稿已保存」） | 发布 | ✅ PASS |
| 知乎 | zhuanlan.zhihu.com/write | DraftJS 富文本粘贴（依赖自动保存） | 自动保存 | 发布 | ✅ PASS |
| 百家号 | 直达编辑器 URL `/builder/rc/edit?type=news` | 分段注入 + 上传通道（cheetah-modal → 隐藏 input → setInputFiles） | 存草稿（「内容已存入草稿」） | 发布（需审核） | ✅ PASS |
| 小红书 | creator.xiaohongshu.com 发布页（切「上传图文」页签） | 纯文本（≤1000 字）+ 图片走 input[type=file]（accept jpg/png/webp） | 「暂存离开」（shadow DOM 点击） | 发布 | ✅ PASS（草稿箱可见） |
| 百度贴吧 | 吧页右上「+发贴」→ Quill 编辑器 | `.ql-editor` fill 纯文本 + 图片走工具条「图片」按钮 filechooser 通道 | 无草稿功能（填表后手动点发布） | 发布（可能有审核延迟） | ✅ PASS（标题/正文 46 字/内联图 1 张） |
| 新浪微博 | weibo.com 首页发博框 | textarea 填「【标题】+正文」（≤2000 字）+ 图片走常驻 multiple input | 无草稿功能（填表后手动点发送） | 发送 | ✅ PASS（正文 57 字计数/缩略图 1 张） |

## 已知限制与注意事项

1. **平台改版风险**：各平台编辑器 selector 可能随版本更新失效。失败任务会截图留证，适配器里的 selector 均为多候选 tryList，便于修一个文件就恢复。
2. **风控**：串行发布、复用真实浏览器指纹已是较低风险路线；但高频、批量发同内容仍可能触发平台审核。建议人工控制发布节奏。
3. **百家号**：旧「发布→图文」菜单点击已失效，现走直达编辑器 URL `/builder/rc/edit?type=news`；若后台弹新手引导/公告弹窗需先手动关一次；上传走「工具栏按钮 → cheetah-modal → 隐藏 input → setInputFiles → 确认」通道。
4. **小红书**：正文不支持富文本（按纯文本提交，Markdown 图片语法会被剥离）；网页端必须至少 1 张图，图片走独立上传通道；默认页签是「上传视频」，须先切「上传图文」。
5. **知乎**：草稿依赖编辑器自动保存（填完等 4 秒）；发布可能弹话题/封面确认框。
6. **百度贴吧**：必须指定目标吧名（forum，Web UI 选中贴吧后会出现吧名输入框）；无草稿功能，draft 模式只填表，由用户手动点「发布」；正文按纯文本填入 Quill（富文本格式丢失可接受）；图片仅 png/jpeg。
7. **新浪微博**：无标题字段（标题并入正文首行「【标题】」）；正文≤2000 字；无草稿功能，draft 模式只填表，由用户手动点「发送」。
8. **验证状态**：7 平台均已在真实登录环境端到端跑通（草稿模式），验证报告见 `data/real-publish-report.json`、截图见 `screenshots/real-*.png`。

## 关键技术结论（踩坑记录）

### -1. 贴吧图片上传：`.input-uploadimg` 是视频封面通道，不是正文图片（重要）

**实际发生的错误**：`setInputFiles` 到 `input.input-uploadimg` 后，页面弹出「**上传视频封面**」
弹窗，图片没有进入正文——该 input 藏在「发视频」表单的 `form-thumbnail-wrap`（封面缩略图区）里。

贴吧发贴页 DOM 里有**两个** file input：
| input | accept | 真实身份 |
|-------|--------|----------|
| `input[accept=".mp4,..."]`（DOM 序在前） | 视频格式 | 发视频的视频文件 |
| `input.input-uploadimg`（`accept="image/png, image/jpeg"`） | 图片 | **发视频的封面图上传**（不是正文图片！） |

**正确通道**：点击编辑器工具条 `.action-btn`「图片」按钮 → 会触发 `filechooser` 事件
（背后是动态创建的 `input[accept="image/jpeg,image/png,image/gif,image/webp"][multiple]`）→
`page.waitForEvent('filechooser')` + `chooser.setFiles(files)`。
上传成功后图片以 `div.tb-plugin-image > img[src*="tiebapic.baidu.com"]` **内联插入** Quill 正文。

另外两个坑：
1. **几百字节的极小图会被静默丢弃**（filechooser 通道不报错、编辑器无变化），测试图须 ≥1KB；
2. 联合选择器 `input.input-uploadimg, input[type=file][accept*=image]` + `.first()` 按 DOM 顺序
   取第一个——发视频表单的 input 在前，`accept` 不含 "image" 时虽不会命中视频 input，
   但 `.input-uploadimg` 本身就是错误目标，必须整体改走 filechooser。

### -2. `querySelector('a, b')` 按 DOM 顺序而非选择器顺序返回（verify 误读标题编辑器）

`document.querySelector('.ql-editor[正文], [contenteditable="true"]')` 想优先取正文编辑器，
但贴吧**标题编辑器**（也是 `[contenteditable="true"]`）在 DOM 里排在前面 → verify 读到标题
（10 字、0 图），误以为正文注入失败。修正：按优先级**逐个尝试** `querySelector`，命中即停。

### -3. prepareImageFiles 的短路三元导致图片提取 0 张（回归用例已加）

旧写法：`srcs = article.images.length ? article.images : extractImages(content)`，html 分支只在
前面都空时才走。一旦 `article.images` 是**非空但无效**（如 `['']`），永远不回落去解析
content/html——「html 里明明有 1 张 base64 图，却提取到 0 张」。修正：合并 images + markdown +
html base64 三个来源并去重（`tieba.js / weibo.js#prepareImageFiles`），单测
`scripts/test-image-extract.js` 覆盖 7 种来源组合 × 2 平台（14 用例）。

### 0. 小红书「暂存离开」在 closed shadow DOM 里（重要）

实测：小红书发布页底部「暂存离开/发布」按钮是 Web Component `<xhs-publish-btn>`，内部为 **closed shadow root**：
- `text=` / `getByText` / `has-text` 选择器全部无法命中（Playwright 只自动穿透 open shadow）
- `document.querySelectorAll` / `innerText` 也搜不到内部文本
- 但截图里按钮明明可见，`elementFromPoint` 只命中 host 元素

解法（`base.js#clickShadowButton`）：CDP `DOMSnapshot.captureSnapshot` 会捕获 shadow 树全部节点与布局，
从快照里按文本找到宿主 BUTTON，坐标 ÷ devicePixelRatio（实测小红书页 dpr=2）转视口坐标后 `mouse.click`。

### 0.1 微信图片必须走素材库 + 编辑器原生结构（重要）

实测两个坑：
1. 微信 ProseMirror schema **丢弃裸 img**（无论 src 是 `data:` 还是 `mmbiz.qpic.cn` CDN 地址），insertHTML 注入瞬间即被删除；
2. 通过 filechooser 插入的图会留下 `data-upload="1"` 占位，但**编辑器不自动上传**（占位永远停在 data URI）。

可行方案（`weixin.js`）：
- **上传**：在编辑器页面上下文 `fetch` 同源接口 `/cgi-bin/filetransfer?action=upload_material&scene=8`（自动带 cookie，
  票据取自 `window.wx.commonData.data.ticket`），返回 `cdn_url`；ret=200039 为频率限制需间隔重试
- **插入**：模仿编辑器自己生成的结构 —— `<section style="text-align:center" nodeleaf=""><img src="{CDN}" class="rich_pages wxw-img" data-ratio data-w type="block" contenteditable="false"></section>`，文字段与图片段分段注入
- 标题同理：原生 `#title` textarea 已 `visibility:hidden`（仅存储），可视标题是 `.title-editor-overlay .ProseMirror`，填它即自动同步

### 1. 不能伪造 ClipboardEvent（重要）

```js
// ✗ 完全无效：浏览器禁止脚本伪造粘贴内容，编辑器读不到
el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
```
实测结论：粘贴后编辑器内容**一字未变**。这是"只看到文字、图片不显示"这类问题的常见根因之一。
真实剪贴板路线（`navigator.clipboard.write` + Ctrl+V）在有头 https 页面可行，但 headless / 非安全上下文下 `navigator.clipboard` **直接不存在**，不可靠。

**采用方案**：框架感知的 DOM 注入 —— 识别编辑器类型后走 `beforeinput` + `execCommand('insertHTML')`，兜底 `innerHTML`，最后补发 `input`/`change` 事件同步框架内部 state。

### 2. 图片必须与文字分开注入

整段 HTML 里的 `<img>` 在富文本编辑器（尤其 ProseMirror）中常被丢弃。
**采用方案**：先注入文字结构（图片位置留唯一占位符），再逐张 `execCommand('insertImage')` 原位替换。

### 3. Chrome 136+ 调试端口限制

默认 user-data-dir 不允许隐式开调试端口，必须显式传 `--user-data-dir`。
且同一 profile 不允许双实例——Chrome 运行中时带调试参数启动无效。

**实测确认的两个启动失败原因**：
1. **日常 Chrome 正在运行** → 新实例的调试参数被丢弃（Chrome 单实例机制）
2. **profile 目录残留锁文件**（`SingletonLock` / `SingletonCookie` / `SingletonSocket`）→
   Chrome 认为 profile 被占用，进程启动后立即退出，端口永远不开

**对应解法（已内置）**：
- 提供两种 profile 模式：
  - `独立 profile`（默认推荐）：用 `data/browser-profile/chrome` 独立目录启动，
    **不影响你正在使用的 Chrome**，首次需在该专用窗口登录各平台
  - `复用日常 profile`：登录态直接可用，但**必须先完全退出 Chrome**（含托盘图标）
- 启动前自动清理 profile 锁文件
- 启动后轮询探测端口，最多等 20 秒；进程异常退出立即返回退出码而非空等
- 提供 `/api/diagnose` 与页面「诊断」按钮，直接把原因说清楚

### 4. 外链图片转存必须严格校验

防盗链常见手法：返回 **HTTP 404 但 `content-type: image/gif`** 的 1x1 占位图（仅几十字节）。
若只检查 content-type，会把假图当正常图片，粘贴后平台不显示 → 表现为「只有文字没图片」。

**修正**：校验 HTTP 状态码 + 真实字节数（<1KB 视为失败）+ **文件头魔数**（jpeg/png/gif/webp/bmp/svg）。
**转存失败的图片整段从正文移除**，绝不留外链——这是关键，外链图粘贴必被拦截。

### 5. 微信登录检测不能只看 URL

实测：微信未登录时 URL **停留在 `mp.weixin.qq.com/` 不跳转**（不像其他平台会跳到 `/login`），
页面实为扫码登录页（含 `scanloginqrcode` 二维码图、`login__type__container` 容器）。
若只查 URL 关键字会漏判「未登录」。

**修正**：以「**已登录才有的后台元素**」为主判据（`.weui-desktop-menu`、`.new-creation__menu-item`、
`text=新的创作` 等），登录页特征为副判据。其余平台（头条/知乎/百家号/小红书）URL 会真实跳转
`/login`，以 URL 为主判据 + 登录表单特征兜底。

### 5b. 登录检测不能用 isVisible + 联合选择器（头条真实误判修复）

**实际发生的误判**：用户已登录头条（页面显示「在头条创作的第 1141 天」），`checkLogin` 却返回
「无法确认登录态」。逐层排查（count → waitFor → DOM 细查）找到两个叠加缺陷：

1. **`isVisible({timeout})` 在 Playwright 1.44 不会真正等待**——立即返回。SPA 慢渲染时检测瞬间
   页面还没画完 → 误判。且 **`isVisible` 语义本身不可靠**，必须用 `waitFor({state:'visible'})`。
2. **联合选择器 `.first().isVisible()` 只看 DOM 顺序第一个匹配元素**——它可能恰好是隐藏元素。
   实测 `[class*="creator"]` 在头条后台只命中 `<span class="creator-rights-message">`（rect 0x0）。
3. 附带发现：**已登录特征选择器必须对真实登录后的页面验证**。假 page 单测测不出
   「选择器与真实 DOM 错配」——头条后台 dashboard 上根本没有 ProseMirror/标题框。

**修正**：base.js 新增 `anyVisible(page, selectors, timeout)`——`count()` 先探（立即返回），
无匹配时 `waitFor` 真实等待至超时，有匹配时**逐个元素**验证可见性；五个适配器的
`doCheckLogin` 全部切换。头条已登录特征改用后台菜单文本（`text=作品管理`、`text=草稿箱`、
`text=创作灵感`、`text=粉丝数`——仅登录后台可见）。
回归：`test-login-detect-both.js` ① 真实页合理性 5/5 + ② 正向单测 4/4 全绿。

### 6. 浏览器异常绝不能带崩服务（真实崩溃修复）

**实际发生过的崩溃**：
```
browserContext.newPage: Protocol error (Target.createTarget): Failed to open a new tab
→ 未捕获异常 → Node 进程直接退出 → 服务不可用
```
原因：`newPage()` 写在了 `try` **外面**。浏览器被手动关闭时它会抛错，
在 try 外抛出即成为 unhandledRejection，直接终止 Node 进程。

**修正（三层防护）**：
1. `checkLogin` / `publish` 中 `newPage()` **移入 try 内**，返回可读错误而非抛出
2. `server.js` 注册 `unhandledRejection` / `uncaughtException` 全局兜底
3. `getContext()` 增加连接健康检查（`browser.isConnected()`）——断连时自动清理连接并提示重连
4. 路由统一 `wrap` 包装：区分「浏览器未连接/断开」（**HTTP 400 + `needReconnect:true`**，客户端状态问题）
   与真正的服务端异常（HTTP 500）
5. `/api/check-login` 逐平台隔离，单平台异常不影响其他平台

**验证**：`test-resilience.js`（组件层 7/7 PASS）+ `test-server-resilience.js`（HTTP 层 9/9 PASS），
均复现「浏览器中途关闭」，确认服务进程存活。

### 7. 头条 AI 助手抽屉的全屏遮罩拦截 click（2026-10-01 实测修复）

**现象**：发布任务报 `locator.click: Timeout 15000ms exceeded`，截图里编辑器已打开但空白，
左下角有「我知道了」提示条（一度怀疑是它）。

**根因（探测定位）**：右侧「头条创作助手」AI 侧栏（`.byte-drawer-wrapper.ai-assistant-drawer`）
的 **`.byte-drawer-mask` 全屏透明遮罩**（z-index=1002、`pointer-events:auto`）盖住了整个页面——
在 `.ProseMirror` 中心做 `elementFromPoint` 命中的是 mask 而非编辑器，普通 `click()` 的
actionability 检查（命中目标必须是目标元素）永远不通过 → 超时。**`focus()` 和 `force:true` 不受影响**。

**修正**：
1. `toutiao.js#doPublish` 打开页面后 `display:none` 隐藏抽屉+遮罩（publish 模式点「发布」按钮同样依赖），
   顺手点掉 `.mp-func-guide-dismiss`「我知道了」提示；
2. `base.js#pasteRichText` 聚焦改为 `click()` 失败时 fallback `focus()`（通用防御，focus 不走命中测试）。

### 8. 贴吧吧页面 JS 自崩，「发贴」按钮点了没反应（2026-10-01 改走首页弹窗）

**现象**：在吧页面（`f?kw=软件吧`）真实鼠标点击 `.add-post`「发贴」，URL 不变、无弹窗、无 `.ql-editor`。
经典发贴 URL `f/commit/shareorcreate/` 已 404。

**根因（CDP `Runtime.exceptionThrown` 定位）**：吧页面加载时自身 JS 抛
**`_typeof is not defined`**（babel helper 缺失）——渲染发贴组件的 bundle 崩了，事件绑定没执行。
点击时不再抛新错（因为根本没绑上）。ERR_CONNECTION_REFUSED 全部来自微信小游戏 SDK（无关，已排除）。

**修正**：改走**贴吧首页**（`tieba.baidu.com`）点「发贴」→ 全局发贴弹窗（`.publisher-warp`）一切正常，
且自带「选择吧」搜索框：`input.search-box` 输入吧名 → 等 `.search-warp .forum-list` 联想项 → 点击选中
→ 无结果时显示 `.no-data`「没有搜索到相关吧」（顺带替代了旧版「该吧还未建立」检测）。
标题/正文仍按 `.ql-editor[data-placeholder*="标题|正文"]` 定位。

### 9. Playwright strict mode：多元素匹配让 waitFor 立即抛错而非等待（贴吧真实踩坑）

**现象**：弹窗已弹出（截图可见标题框），适配器却在 ~1 秒内报「未等到标题编辑器」——远小于 10s 超时。

**根因**：`locator('.ql-editor[data-placeholder*="标题"]')` 同时匹配「贴子标题」和「视频标题」
两个编辑器（都含「标题」二字），**未加 `.first()` 时 strict mode violation 让 waitFor 直接 throw**
（95ms 失败），`catch(() => false)` 吞掉异常后看起来像「没等到」。

**修正**：所有 waitFor 前先 `.first()`。教训：**strict violation 与「元素不存在」症状完全不同但
都被 catch 吞掉后无法区分**——排查时务必打印真实异常（`catch((e) => log(e.message))`）而不是静默 false。

## 自动化测试

```bash
node scripts/verify-all.js        # 一键全量验证（推荐，输出 A图片/B注入/C连接/D登录 四组结论）
node scripts/check-login.js       # 快速巡检各平台登录态
node scripts/test-real-publish.js # 【真实环境】在已登录平台打开编辑器，真实注入图文并核对+截图
node scripts/test-image-extract.js # 贴吧/微博 prepareImageFiles 图片来源提取单测（7 场景×2 平台）
node scripts/test-paste.js        # 基础注入：空编辑器 / 已有内容两种场景
node scripts/test-frameworks.js   # 四大富文本框架兼容性（ProseMirror/DraftJS/UEditor/普通）
node scripts/test-e2e.js          # 端到端：拉起浏览器→CDP连接→注入图文→校验（含坏图剔除）
node scripts/test-resilience.js   # 组件健壮性：浏览器中途关闭时各组件的行为
node scripts/test-server-resilience.js # 服务健壮性：浏览器关闭后服务不崩溃（含 HTTP 层验证）
node scripts/probe-platforms.js   # 各平台真实登录检测并截图存证
node scripts/audit-login-detect.js# 审计登录检测的中间状态，排查误判
node scripts/test-login-detect-both.js # 登录检测「双向」验证：既证明未登录判否，也证明已登录判是
```

`test-login-detect-both.js` 用来排除「检测逻辑恒返回 false」这种**伪通过**：
第一轮拿真实页面跑检测（应全部判否），第二轮对微信注入已登录 DOM（应变判是），
第三轮对头条/知乎/百家号/小红书用「后台 URL + 编辑器 DOM」的假 page 单测正向分支（应变判是）。
只有正向和反向都过，才能确认登录检测可信。

### 登录后必做：真实环境验证

在专用浏览器窗口登录各平台后，运行：

```bash
node scripts/test-real-publish.js            # 验证所有已登录平台
node scripts/test-real-publish.js zhihu      # 只验证知乎
node scripts/test-real-publish.js --submit   # ⚠️ 真实提交（默认只填表，不点发布）
```

该脚本会**真实打开各平台编辑器、注入图文、读取编辑器内实际内容核对**（文字长度、图片数量、
是否全为 base64、有无外链残留、有无占位符残留），并截图到 `screenshots/real-<平台>.png`。
默认**草稿模式只填表不提交**，不影响线上内容。

前三个脚本完全离线（headless Chrome，不需登录态），改动注入逻辑后应先跑它们。
`verify-all.js` 报告输出到 `data/verify-report.json`。

### 实测验证结果（2026-10-01，7 平台）

| 检查组 | 项目 | 结果 |
|--------|------|------|
| A. 图片处理 | 正常图转 base64 / 坏图识别剔除 / 无外链残留 / 文字完整 / URL 提取 | **5/5 PASS** |
| B. 富文本注入 | ProseMirror / DraftJS / UEditor / 普通编辑器（含格式保留、无残留、base64 图） | **8/8 PASS** |
| C. 浏览器连接 | 调试端口监听 / CDP 连接与页面控制 | **2/2 PASS** |
| D. 平台登录态 | 7 个平台的登录检测逻辑 | **7/7 已登录 PASS**（`verify-all.js`） |
| D+. 图片提取单测 | 贴吧/微博 prepareImageFiles 7 场景 × 2 平台 | **14/14 PASS**（`test-image-extract.js`） |
| E. 真实发布链路 | 7 个平台打开编辑器→注入图文→核对→截图 | ✅ **全部 PASS**（贴吧 46 字/图 1 张；微博 57 字/图 1 张；其余 5 平台此前已过） |

> E 组为草稿模式（只填表不提交），报告见 `data/real-publish-report.json`，截图见 `screenshots/real-*.png`。

## 扩展新平台（如 QQ空间/抖音等）

1. 复制 `src/adapters/toutiao.js` 改名，实现 `meta / doCheckLogin / doPublish`
2. 在 `src/adapters/index.js` 注册
3. 在 `src/core/rules.js` 添加该平台规则
4. 若需要额外入参（如贴吧的 forum），参照 `queue.js → base.js#publish → 适配器` 的 forum 字段透传链

## 目录结构

```
multi-publisher/
├── server.js              # Express 服务 + REST API
├── src/core/browser.js    # CDP 连接管理 / 拉起浏览器 / 截图
├── src/core/rules.js      # 平台规则校验
├── src/core/article.js    # Markdown→HTML / 图片 base64 化
├── src/core/queue.js      # 串行发布队列（持久化）
├── src/adapters/          # 平台适配器（base + 7 平台）
├── public/                # Web UI
├── articles/              # 发布的文章存档（md）
├── data/tasks.json        # 任务持久化
└── screenshots/           # 失败截图
```
