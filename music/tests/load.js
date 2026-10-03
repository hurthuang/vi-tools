// 在 Node 中依序載入瀏覽器用的模組
const path = require('path');
for (const f of ['brf', 'model', 'durations', 'abc-parse', 'braille-write', 'braille-parse', 'abc-write', 'annotate', 'xml', 'musicxml', 'describe', 'zh-braille', 'samples', 'rules-data'])
  require(path.join(__dirname, '..', 'js', f + '.js'));
module.exports = globalThis.MB;
