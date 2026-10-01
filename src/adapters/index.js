/** 适配器注册表：新增平台 = 新增一个文件并在此注册 */
const WeixinPublisher = require('./weixin');
const ToutiaoPublisher = require('./toutiao');
const ZhihuPublisher = require('./zhihu');
const BaijiahaoPublisher = require('./baijiahao');
const XiaohongshuPublisher = require('./xiaohongshu');
const TiebaPublisher = require('./tieba');
const WeiboPublisher = require('./weibo');

const instances = {
  weixin: new WeixinPublisher(),
  toutiao: new ToutiaoPublisher(),
  zhihu: new ZhihuPublisher(),
  baijiahao: new BaijiahaoPublisher(),
  xiaohongshu: new XiaohongshuPublisher(),
  tieba: new TiebaPublisher(),
  weibo: new WeiboPublisher(),
};

module.exports = instances;
