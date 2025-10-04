// 分析歌词时间间隔
const lyrics = [
  { time: 0.00, text: '' },
  { time: 5.92, text: '' },
  { time: 11.84, text: '观自在菩萨' },
  { time: 18.68, text: '行深般若波罗蜜多时' },
  { time: 28.87, text: '照见五蕴皆空' },
  { time: 36.79, text: '度一切苦厄' },
  { time: 43.03, text: '' },
  { time: 49.28, text: '舍利子' },
  { time: 52.53, text: '色不异空' },
  { time: 54.00, text: '空不异色' },
  { time: 103.47, text: '色即是空' },
  { time: 105.75, text: '空即是色' },
  { time: 114.04, text: '受想行识' },
  { time: 118.23, text: '亦复如是' },
  { time: 131.22, text: '舍利子' },
  { time: 134.09, text: '是诸法空相' },
  { time: 138.88, text: '不生不灭' },
  { time: 141.51, text: '不垢不净' },
  { time: 144.14, text: '不增不减' },
  { time: 146.77, text: '是故空中无色' },
  { time: 152.07, text: '无受想行识' },
  { time: 155.33, text: '无眼耳鼻舌身意' },
  { time: 158.71, text: '无色声香味触法' },
  { time: 165.14, text: '无眼界' },
  { time: 167.48, text: '乃至无意识界' },
  { time: 172.16, text: '无无明' },
  { time: 175.28, text: '亦无无明尽' },
  { time: 180.50, text: '乃至无老死' },
  { time: 183.77, text: '亦无老死尽' },
  { time: 187.05, text: '无苦集灭道' },
  { time: 190.06, text: '无智亦无得' },
  { time: 195.59, text: '' },
  { time: 205.59, text: '' },
  { time: 215.59, text: '' },
  { time: 222.07, text: '以无所得故' },
  { time: 225.32, text: '菩提萨陲' },
  { time: 229.13, text: '依般若波罗蜜多故' },
  { time: 234.10, text: '心无挂碍' },
  { time: 238.59, text: '无挂碍故' },
  { time: 242.10, text: '无有恐怖' },
  { time: 244.61, text: '远离颠倒梦想' },
  { time: 248.18, text: '究竟涅盘' },
  { time: 253.06, text: '三世诸佛' },
  { time: 255.79, text: '依般若波罗蜜多故' },
  { time: 261.27, text: '得阿耨多罗' },
  { time: 264.00, text: '三藐三菩提' },
  { time: 267.17, text: '' },
  { time: 273.08, text: '' },
  { time: 277.64, text: '' },
  { time: 287.27, text: '' },
  { time: 297.91, text: '故说般若波罗蜜多咒' },
  { time: 305.09, text: '' },
  { time: 312.27, text: '即说咒曰' },
  { time: 322.16, text: '' },
  { time: 332.62, text: '揭谛揭谛' },
  { time: 340.71, text: '波罗揭谛' },
  { time: 350.20, text: '波罗僧揭谛' },
  { time: 358.83, text: '菩提娑婆诃' },
  { time: 369.41, text: '' },
  { time: 380.41, text: '' }
];

console.log('=== 歌词时间间隔分析 ===');
console.log('');

// 分析所有间隔
const intervals = [];
for (let i = 1; i < lyrics.length; i++) {
  const diff = lyrics[i].time - lyrics[i-1].time;
  intervals.push({
    from: lyrics[i-1].text || '(空白)',
    to: lyrics[i].text || '(空白)',
    fromTime: lyrics[i-1].time,
    toTime: lyrics[i].time,
    interval: diff
  });
}

// 找出最大的间隔
const sortedIntervals = intervals.sort((a, b) => b.interval - a.interval);
console.log('最大的10个时间间隔：');
sortedIntervals.slice(0, 10).forEach((item, idx) => {
  console.log(`${idx + 1}. "${item.from}" -> "${item.to}"`);
  console.log(`   时间: ${item.fromTime.toFixed(2)}s -> ${item.toTime.toFixed(2)}s`);
  console.log(`   间隔: ${item.interval.toFixed(2)}s (${(item.interval/60).toFixed(2)}分钟)`);
  console.log('');
});

// 特别分析问题段落
console.log('=== 特别分析：无智亦无得 -> 以无所得故 ===');
const problemFrom = lyrics.find(l => l.text === '无智亦无得');
const problemTo = lyrics.find(l => l.text === '以无所得故');
if (problemFrom && problemTo) {
  const fromIndex = lyrics.indexOf(problemFrom);
  const toIndex = lyrics.indexOf(problemTo);
  console.log(`"无智亦无得" 时间: ${problemFrom.time.toFixed(2)}s`);
  console.log(`"以无所得故" 时间: ${problemTo.time.toFixed(2)}s`);
  console.log(`时间间隔: ${(problemTo.time - problemFrom.time).toFixed(2)}s`);
  console.log('');
  console.log('中间的空白行：');
  for (let i = fromIndex + 1; i < toIndex; i++) {
    console.log(`  ${lyrics[i].time.toFixed(2)}s: ${lyrics[i].text || '(空白)'}`);
  }
}

console.log('');
console.log('=== 统计信息 ===');
const totalIntervals = intervals.filter(i => i.interval > 0);
const avgInterval = totalIntervals.reduce((sum, i) => sum + i.interval, 0) / totalIntervals.length;
const maxInterval = Math.max(...totalIntervals.map(i => i.interval));
const minInterval = Math.min(...totalIntervals.map(i => i.interval));
console.log(`平均间隔: ${avgInterval.toFixed(2)}s`);
console.log(`最大间隔: ${maxInterval.toFixed(2)}s`);
console.log(`最小间隔: ${minInterval.toFixed(2)}s`);
console.log('');
console.log('超过5秒的间隔：');
intervals.filter(i => i.interval > 5).forEach(item => {
  console.log(`"${item.from}" -> "${item.to}": ${item.interval.toFixed(2)}s`);
});

console.log('');
console.log('=== 步进问题分析 ===');
console.log('easingFactor = 0.02 的影响：');
console.log('- 当距离为100px时，步进 = 100 * 0.02 = 2px/帧');
console.log('- 当距离为500px时，步进 = 500 * 0.02 = 10px/帧');
console.log('- 当距离为1000px时，步进 = 1000 * 0.02 = 20px/帧');
console.log('- 60fps下，500px距离需要约 500/(500*0.02*60) = 0.83秒');
console.log('');
console.log('空白行导致的布局问题：');
console.log('- 空白行高度: 5rem = 80px (假设基础字体16px)');
console.log('- 正常行高度: 3rem + 3rem + 1.6*font-size');
console.log('- 多个空白行会造成大段空白，增加滚动距离');