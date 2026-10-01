/**
 * 各平台发布规则校验
 * 字数上限以平台公开规则为准，个别平台（百家号等）随版本调整，只做 warn 不做硬阻断，
 * 最终以平台编辑器自身校验为准。
 */

const RULES = {
  weixin: {
    name: '微信公众号',
    title: { max: 64 },
    content: { max: 20000 },
    images: { note: '正文外链图会自动下载转 base64，公众号编辑器粘贴后自动转存素材库' },
  },
  toutiao: {
    name: '今日头条',
    title: { min: 5, max: 30 },
    content: { max: 30000 },
    images: { note: '建议 1~3 张配图，利于推荐' },
  },
  zhihu: {
    name: '知乎',
    title: { min: 1, max: 100 },
    content: { max: 100000 },
  },
  baijiahao: {
    name: '百家号',
    title: { min: 8, max: 30 },
    content: { max: 30000 },
    images: { note: '建议至少 1 张配图，利于推荐' },
  },
  xiaohongshu: {
    name: '小红书',
    title: { min: 1, max: 20 },
    content: { max: 1000 },
    images: { required: 1, note: '网页端发布必须至少 1 张图片；正文不支持富文本（按纯文本提交）' },
  },
  tieba: {
    name: '百度贴吧',
    title: { min: 5, max: 31 },
    content: { max: 30000, suggest: '200~2000 字' },
    images: { max: 9, note: '图片仅支持 png/jpeg，单贴最多 9 张；需指定目标吧名（forum）' },
  },
  weibo: {
    name: '新浪微博',
    title: { optional: true, note: '微博正文无独立标题' },
    content: { max: 2000, note: '头条文章可承载长文；普通微博超过 140 字会折叠显示' },
    images: { max: 9, note: '单条微博最多 9 张图' },
  },
};

/** 纯文本长度（去空白按字符计，中文=1） */
function textLen(s) {
  return (s || '').replace(/\s+/g, '').length;
}

/**
 * 校验文章在指定平台的合规性
 * @returns [{level:'error'|'warn', message}]，error 会阻断该平台的发布
 */
function validate(platform, article) {
  const rule = RULES[platform];
  const items = [];
  if (!rule) return [{ level: 'error', message: `未知平台 ${platform}` }];

  const tLen = textLen(article.title);
  if (rule.title) {
    if (rule.title.min && tLen < rule.title.min) {
      items.push({ level: 'error', message: `标题至少 ${rule.title.min} 字（当前 ${tLen}）` });
    }
    if (rule.title.max && tLen > rule.title.max) {
      items.push({ level: 'error', message: `标题最多 ${rule.title.max} 字（当前 ${tLen}），请精简` });
    }
  }
  if (rule.content) {
    const cLen = textLen(article.content);
    if (rule.content.max && cLen > rule.content.max) {
      items.push({ level: 'error', message: `正文最多 ${rule.content.max} 字（当前约 ${cLen}）` });
    }
  }
  if (rule.images) {
    if (rule.images.required && (!article.images || article.images.length === 0)) {
      items.push({ level: 'error', message: '该平台发布必须包含至少 1 张图片' });
    }
  }
  if (rule.images && rule.images.note) {
    items.push({ level: 'warn', message: rule.images.note });
  }
  return items;
}

/** 多平台批量校验 */
function validateAll(platforms, article) {
  const out = {};
  for (const p of platforms) out[p] = validate(p, article);
  return out;
}

module.exports = { RULES, validate, validateAll, textLen };
