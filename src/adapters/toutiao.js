/**
 * 今日头条适配器（头条号后台）
 * 流程：打开图文发布页 → 填标题 → ProseMirror 粘贴富文本 → 存草稿 / 发布
 */
const { BasePublisher, clickButton, anyVisible } = require('./base');

class ToutiaoPublisher extends BasePublisher {
  get meta() {
    return { id: 'toutiao', name: '今日头条', homeUrl: 'https://mp.toutiao.com/', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();
    if (/signin|login|sso\.douyin|passport/.test(url)) {
      return { ok: false, message: '未登录：请在专用浏览器窗口登录 mp.toutiao.com' };
    }
    // 注意：不能用联合选择器 .first().isVisible()——第一个匹配元素可能隐藏，
    // 且 isVisible 不等待；头条后台是慢渲染 SPA，必须真实等待（见 base.js anyVisible 注释）。
    // 已登录特征须对真实后台页验证：dashboard 上无 ProseMirror/标题框，
    // [class*="creator"] 只匹配到 0x0 隐藏的 creator-rights-message（曾导致误判）。
    // 改用仅登录后台才有的菜单文本作为主判据。
    const ok = await anyVisible(page, [
      '.ProseMirror',
      'textarea[placeholder*="标题"]',
      'text=作品管理',
      'text=草稿箱',
      'text=创作灵感',
      'text=粉丝数',
    ], 6000);
    return ok ? { ok: true, message: '已登录' } : { ok: false, message: '无法确认登录态（页面结构未匹配）' };
  }

  async doPublish(page, article, _ctx, log) {
    log('打开图文发布页');
    await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);

    if (/signin|login|passport/.test(page.url())) throw new Error('头条号未登录');

    // 关闭「我知道了」功能提示 + 隐藏「头条创作助手」AI 侧栏的全屏透明遮罩。
    // 真实踩坑（2026-10-01）：ai-assistant-drawer 的 byte-drawer-mask 覆盖全屏（z=1002、
    // pointer-events:auto），elementFromPoint 命中 mask 而非编辑器，普通 click() 一律
    // Timeout；隐藏抽屉+遮罩后点击路径恢复正常（publish 模式点「发布」按钮同样依赖此步）。
    await page.evaluate(() => {
      try {
        const dismiss = document.querySelector('.mp-func-guide-dismiss');
        if (dismiss) dismiss.click();
      } catch { /* 提示条不存在则忽略 */ }
      try {
        const drawer = document.querySelector('.byte-drawer-wrapper.ai-assistant-drawer');
        if (drawer) drawer.style.display = 'none';
        const mask = document.querySelector('.byte-drawer-mask');
        if (mask) mask.style.display = 'none';
      } catch { /* 抽屉不存在则忽略 */ }
    }).catch(() => {});

    log('填写标题');
    const titleEl = await this.trySelect(page, [
      'textarea[placeholder*="标题"]', 'input[placeholder*="标题"]',
      '.article-input__title', '[data-testid="title-input"]',
    ]);
    if (!titleEl) throw new Error('未找到标题输入框（可能弹了新手引导，请先在后台手动关一次）');
    await titleEl.fill(article.title);

    log('粘贴正文');
    const sel = (await page.locator('.ProseMirror').count()) > 0 ? '.ProseMirror' : '.editor-kit-container [contenteditable="true"]';
    const bodyEl = await this.trySelect(page, [sel], 8000);
    if (!bodyEl) throw new Error('未找到正文编辑区');
    // keepImages：头条 ProseMirror 接受整体注入 base64 图并自动转存上传；
    // 占位符+DOM 插 img 会被其 schema 丢弃（真实踩坑，2026-10-01 实测）
    const bodyStat = await this.fillBody(page, sel, article, log, { keepImages: true });
    await page.waitForTimeout(4000); // 等图片转存上传

    const imgNote = bodyStat.expectedImages ? `（正文含图 ${bodyStat.imgs}/${bodyStat.expectedImages} 张）` : '';

    if (article.mode === 'publish') {
      log('点击发布');
      const ok = await clickButton(page, ['发布'], 6000);
      if (!ok) throw new Error('未找到「发布」按钮');
      await page.waitForTimeout(3000);
      return { ok: true, url: 'https://mp.toutiao.com/profile_v4/graphic/manage', message: `已点击发布${imgNote}，请到内容管理确认` };
    }

    // 头条没有独立「存草稿」按钮：编辑器自动保存（左下角「草稿保存中…/草稿已保存」）
    log('等待头条自动保存草稿');
    const saved = await page.waitForFunction(
      () => /草稿已保存|草稿保存中/.test(document.body.innerText),
      { timeout: 15000 },
    ).then(() => true).catch(() => false);
    if (!saved) {
      return { ok: true, url: page.url(), message: `内容已填入头条编辑器${imgNote}（未见自动保存提示，请打开草稿箱确认）` };
    }
    return { ok: true, url: 'https://mp.toutiao.com/profile_v4/graphic/manage', message: `已由头条自动保存为草稿${imgNote}` };
  }
}

module.exports = ToutiaoPublisher;
