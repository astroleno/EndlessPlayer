# 移动端音频策略说明

## 问题背景

iOS和Android移动端浏览器对音频播放有严格限制：
1. **多音频限制**：不支持同时播放多个音频文件
2. **用户交互要求**：必须通过用户交互才能开始播放音频
3. **自动播放限制**：无法自动播放音频，需要用户主动触发

## 解决方案

### 桌面端策略
- 使用两个音频文件：`tone_singing_bowl.mp3`（引入音效）+ `心经.mp3`（主音频）
- 播放流程：用户点击 → 播放引入音效 → 引入音效结束 → 播放主音频
- 优势：完整的音频体验，包含引入音效

### 移动端策略
- 使用合并音频文件：`心经_2.mp3`（包含引入音效+主音频）
- 播放流程：用户点击 → 直接播放合并音频
- 优势：避免多音频播放限制，简化播放逻辑

## 技术实现

### 移动端检测
```javascript
const checkMobile = () => {
  const userAgent = navigator.userAgent;
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  
  return isMobileDevice || (isTouchDevice && isSmallScreen);
};
```

### 音频文件选择
```javascript
const audioPath = isMobile ? '/audio/心经_2.mp3' : '/audio/心经.mp3';
```

### 播放逻辑
```javascript
if (isMobile) {
  // 移动端：直接播放合并音频
  mainAudio.play();
} else {
  // 桌面端：先后播放引入音频和主音频
  introAudio.play().then(() => {
    // 引入音频结束后播放主音频
  });
}
```

## 文件结构

```
public/audio/
├── tone_singing_bowl.mp3    # 引入音效（桌面端使用）
├── 心经.mp3                 # 主音频（桌面端使用）
└── 心经_2.mp3              # 合并音频（移动端使用）
```

## 优势

1. **兼容性**：完美支持iOS和Android的音频播放限制
2. **用户体验**：移动端和桌面端都有完整的音频体验
3. **性能**：移动端减少音频文件数量，提高加载速度
4. **维护性**：代码逻辑清晰，易于维护和调试

## 调试信息

在开发模式下，页面会显示调试信息：
- Mobile: 是否为移动端
- Audio: 当前使用的音频文件路径
- 其他播放状态信息

## 部署注意事项

1. 确保所有音频文件都正确部署到 `/audio/` 目录
2. 检查音频文件的可访问性
3. 测试移动端和桌面端的播放功能
4. 验证音频文件格式的兼容性
