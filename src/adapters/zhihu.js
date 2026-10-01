/**
 * 知乎适配器（专栏文章）
 * 流程：zhuanlan.zhihu.com/write → 填标题 → DraftJS 编辑器粘贴富文本
 * 知乎编辑器自动保存；发布模式点击「发布」。
 */
const { BasePublisher, clickButton, anyVisible } = require('./base');

class ZhihuPublisher extends BasePublisher {
  get meta() {
    return { id: 'zhihu', name: '知乎', homeUrl: 'https://zhuanlan.zhihu.com/write', inlineImages: true };
  }

  async doCheckLogin(page) {
    const url = page.url();
    // 主判据：URL 跳转到登录页
    if (/signin|\/login/.test(url)) return { ok: false, message: '未登录：请在专用浏览器窗口登录知乎' };

    // 已登录：写文章页出现编辑器或标题框（anyVisible 真实等待 + 逐元素验证）
    const editor = await anyVisible(page, ['textarea[placeholder*="标题"]', '.public-DraftEditor-content'], 6000);
    if (editor) return { ok: true, message: '已登录' };

    // 兜底：出现登录表单特征则判未登录
    const loginForm = await anyVisible(page, ['input[placeholder*="手机"]', 'text=验证码登录', 'text=扫码登录'], 2000);
    if (loginForm) return { ok: false, message: '未登录：页面为登录界面' };

    return { ok: false, message: '无法确认登录态（页面结构未匹配，可能改版或加载未完成）' };
  }

  async doPublish(page, article, _ctx, log) {
    log('打开知乎写文章页');
    await page.goto('https://zhuanlan.zhihu.com/write', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    if (/signin|\/login/.test(page.url())) throw new Error('知乎未登录');

    log('填写标题');
    const titleEl = await this.trySelect(page, ['textarea[placeholder*="标题"]', 'input[placeholder*="标题"]']);
    if (!titleEl) throw new Error('未找到标题输入框');
    await titleEl.fill(article.title);

    log('粘贴正文');
    const sel = '.public-DraftEditor-content';
    const bodyEl = await this.trySelect(page, [sel], 8000);
    if (!bodyEl) throw new Error('未找到正文编辑区');
    const bodyStat = await this.fillBody(page, sel, article, log);
    await page.waitForTimeout(3000); // 等自动保存

    const imgNote = bodyStat.expectedImages ? `（正文含图 ${bodyStat.imgs}/${bodyStat.expectedImages} 张）` : '';

    if (article.mode === 'publish') {
      log('点击发布');
      const ok = await clickButton(page, ['发布'], 6000);
      if (!ok) throw new Error('未找到「发布」按钮（可能弹了封面/话题确认框，请手动处理一次）');
      await page.waitForTimeout(4000);
      // 发布后跳转到文章页
      const url = page.url();
      const finalUrl = /\/p\/\d+/.test(url) ? url : 'https://zhuanlan.zhihu.com/posts';
      return { ok: true, url: finalUrl, message: `已发布知乎文章${imgNote}` };
    }

    log('等待自动保存');
    await page.waitForTimeout(4000);
    return { ok: true, url: 'https://zhuanlan.zhihu.com/posts', message: `已填写，知乎编辑器自动保存为草稿${imgNote}` };
  }
}

module.exports = ZhihuPublisher;
