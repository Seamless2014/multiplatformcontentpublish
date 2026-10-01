/* 单测：tieba / weibo prepareImageFiles 全来源覆盖（图片均 ≥1KB） */
const path = require('path');
const fs = require('fs');
process.chdir(path.join(__dirname, '..', '..'));
const TiebaPublisher = require(path.join(__dirname, '..', 'src', 'adapters', 'tieba'));
const WeiboPublisher = require(path.join(__dirname, '..', 'src', 'adapters', 'weibo'));

// >1KB 的伪 PNG base64（PNG 头 + 填充；单测只验证字节处理逻辑，不验证图片内容）
const HEAD = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAABMCAYAAACZTq0gAAAAaElEQVR4nO3BMQEAAADCoPVPbQlPoAAA4J8AAOABa1YUWAEAAADgmrVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1qxZs2bNmjVr1gAwF+RXAAGuMmXKAAAAAElFTkSuQmCC';
const PAD = Buffer.alloc(2048, 65).toString('base64'); // 2048 字节 'A' 的 base64
const B64 = HEAD + PAD;

const dataUri = () => `data:image/png;base64,${B64}`;
const HTML = `<h2>标题</h2>\n<p>文字。</p>\n<p><img src="${dataUri()}" alt="图"></p>`;
const MD = `# 标题\n\n文字。\n\n![图](${dataUri()})\n`;

const cases = [
  ['images=[] + content(md data uri) + html', { images: [], content: MD, html: HTML }, 1],
  ['images=[""] 无效非空 + html（回归用例）', { images: [''], content: '', html: HTML }, 1],
  ['images=[] + content 空 + html', { images: [], content: '', html: HTML }, 1],
  ['全部来源都有 (应去重为1)', { images: [dataUri()], content: MD, html: HTML }, 1],
  ['全空', { images: [], content: '', html: '' }, 0],
  ['<1KB 小图应过滤', { images: ['data:image/png;base64,' + Buffer.alloc(500, 65).toString('base64')], content: '', html: '' }, 0],
  ['图片超上限 12 -> 9', { images: Array.from({ length: 12 }, (_, i) => `data:image/png;base64,${Buffer.concat([Buffer.from(String(i)), Buffer.alloc(2100, 65)]).toString('base64')}`), content: '', html: '' }, 9],
];

let pass = 0, fail = 0;
for (const [name, article, expect] of cases) {
  for (const [label, Cls] of [['tieba', TiebaPublisher], ['weibo', WeiboPublisher]]) {
    const files = new Cls().prepareImageFiles(article);
    const ok = files.length === expect;
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${label}] ${name} -> ${files.length} (期望 ${expect})`);
    for (const f of files) {
      const sz = fs.statSync(f).size;
      if (sz < 1024) { console.log(`   ⚠ 文件过小 ${sz}B:`, f); fail++; }
    }
  }
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
