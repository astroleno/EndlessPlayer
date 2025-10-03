<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Endless Player

一个支持真实音频循环播放、自动滚动歌词与手动跟随定位的网页播放器。

## 目录结构

- `public/audio/`：放置音频资源。已内置：
  - `心经.mp3`
  - `tone_singing_bowl.mp3`
- `constants.ts`：内置 `LRC_LYRICS`（心经 LRC 歌词）。
- `hooks/useLyrics.ts`：LRC 解析为时间戳/文本行。
- `components/`：
  - `AudioPlayer.tsx`：底部控制条（播放/暂停、进度、时间）。
  - `LyricsScroller.tsx`：自动+手动滚动歌词，支持滚动结束后自动对齐最近可见行并跳转音频位置。
- `App.tsx`：应用主逻辑，负责加载真实音频、同步进度与歌词。

## 本地运行

前置条件：已安装 Node.js（建议 18+）。

1. 安装依赖：
   ```bash
   npm install
   ```
2. 启动开发服务器：
   ```bash
   npm run dev
   ```
3. 浏览器访问（Vite 默认提示的本地地址，一般为）：
   - `http://localhost:5173`

## 音频接入说明（重要）

- 将你的音频文件放入 `public/audio/` 目录，例如 `public/audio/我的歌.mp3`。
- 在运行时，`/audio/我的歌.mp3` 可被直接访问（Vite 会自动拷贝到构建产物）。
- 本项目已将播放器的音源切换为 `public/audio/心经.mp3`。
- 页面加载后会在音频 `onLoadedMetadata` 时读取真实时长并覆盖初始估算时长，保证进度条与歌词滚动精确匹配。

## 交互说明

- 播放/暂停：底部控制条按钮。
- 进度拖动：底部进度条拖动；歌词区域滚动后短暂停止，自动对齐最近可见行并同步音频位置。
- 无限循环：播放到结尾自动回到开头，歌词滚动保持连续性。

## 常见问题

- 听不到声音或无法播放：
  - 确保浏览器允许自动播放策略（首次可能需要手动点击播放）。
  - 确保 `public/audio/心经.mp3` 文件存在，或替换为你自己的音频路径。
- 歌词与音频节拍不对齐：
  - 确保 `constants.ts` 中的 LRC 时间戳与音频版本匹配。

## 构建与部署

```bash
npm run build
npm run preview
```

将 `dist/` 目录部署到任意静态网站托管即可。
