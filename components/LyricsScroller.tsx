import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { LyricLine } from '../types';

interface LyricsScrollerProps {
  lyrics: LyricLine[];
  scrollTime: number;
  displayTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
}

const PLAYING_INTERACTION_DELAY = 800; // 播放状态下的延迟，给用户足够时间完成滚动
const PAUSED_INTERACTION_DELAY = 300; // 暂停状态下的延迟，给用户足够时间完成滚动

const findCurrentLineIndex = (lyricLines: LyricLine[], time: number, duration: number) => {
    if (!lyricLines || lyricLines.length === 0 || duration <= 0) return -1;
    const loopTime = time % duration;
    let lineIndex = -1;
    for (let i = 0; i < lyricLines.length; i++) {
        if (lyricLines[i].time <= loopTime) {
            lineIndex = i;
        } else {
            break;
        }
    }
    return lineIndex;
};

const LyricsScroller: React.FC<LyricsScrollerProps> = ({ lyrics, scrollTime, displayTime, duration, onSeek, isPlaying }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const animationFrameRef = useRef<number>();
  
  // State refs for managing user interaction
  const isUserInteractingRef = useRef(false);
  const interactionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollRef = useRef(false);
  
  // 滚动平滑插值相关
  const currentScrollTopRef = useRef(0);
  const targetScrollTopRef = useRef(0);
  const lastScrollTopRef = useRef(0); // 用于检测滚动方向

  // 时间插值相关
  const interpolatedTimeRef = useRef(displayTime);
  const lastTimeUpdateRef = useRef(Date.now());
  const targetTimeRef = useRef(displayTime);
  
  
  // iOS移动端特殊处理
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const repeatedLyrics = useMemo(() => Array(9).fill(null).flatMap(() => lyrics), [lyrics]);
  const currentLineIndex = findCurrentLineIndex(lyrics, displayTime, duration);
  const loopCount = duration > 0 ? Math.floor(scrollTime / duration) : 0;
  const absoluteCurrentIndex = currentLineIndex >= 0 ? loopCount * lyrics.length + currentLineIndex : -1;
  
  // 简化的DOM查询函数
  const getCenterPosition = useCallback((index: number) => {
    const lineEl = lineRefs.current[index];
    if (!lineEl) return 0;

    const scroller = scrollerRef.current;
    if (!scroller) return 0;

    return lineEl.offsetTop - (scroller.clientHeight / 2) + (lineEl.offsetHeight / 2);
  }, []);

  // 时间插值更新函数
  const updateInterpolatedTime = useCallback(() => {
    const now = Date.now();
    const deltaTime = (now - lastTimeUpdateRef.current) / 1000; // 转换为秒
    lastTimeUpdateRef.current = now;

    if (isPlaying) {
      // 计算目标时间（考虑循环）
      const targetTime = targetTimeRef.current;
      const interpolatedTime = interpolatedTimeRef.current;

      // 计算时间差
      let timeDiff = targetTime - interpolatedTime;

      // 优化循环边界处理，减少复杂条件判断
      if (duration > 0) {
        const normalizedCurrent = interpolatedTime % duration;
        const normalizedTarget = targetTime % duration;

        // 计算在循环周期内的最短距离
        let directDiff = normalizedTarget - normalizedCurrent;
        const wrappedDiff = directDiff > 0 ? directDiff - duration : directDiff + duration;

        // 选择最短路径
        timeDiff = Math.abs(directDiff) < Math.abs(wrappedDiff) ? directDiff : wrappedDiff;
      }

      // 动态调整平滑系数：时间差越大，跟踪越紧
      const absTimeDiff = Math.abs(timeDiff);
      let smoothingFactor = 0.08; // 基础平滑系数，更紧的跟踪

      if (absTimeDiff > 5.0) {
        smoothingFactor = 0.3; // 大时间差时快速跟踪
      } else if (absTimeDiff > 2.0) {
        smoothingFactor = 0.15; // 中等时间差时适度跟踪
      } else if (absTimeDiff < 0.1) {
        smoothingFactor = 0.05; // 小时间差时平滑跟踪
      }

      interpolatedTimeRef.current += timeDiff * smoothingFactor;

      // 优化防漂移逻辑：使用更小的阈值和渐进式修正
      if (Math.abs(interpolatedTimeRef.current - targetTime) > 0.2) {
        // 使用渐进式修正而不是直接重置
        const correctionFactor = 0.1;
        interpolatedTimeRef.current += (targetTime - interpolatedTimeRef.current) * correctionFactor;
      }
    }

    return interpolatedTimeRef.current;
  }, [isPlaying, duration]);
  
  // This is the core animation loop for automatic scrolling
  const scrollStep = useCallback(() => {
    // 修复：在用户交互时完全停止自动滚动，避免覆盖用户操作
    if (!isPlaying || !scrollerRef.current || lyrics.length < 2) {
      animationFrameRef.current = requestAnimationFrame(scrollStep);
      return;
    }

    if (isUserInteractingRef.current) {
      // 用户正在交互时，完全停止自动滚动，让用户完全控制
      animationFrameRef.current = requestAnimationFrame(scrollStep);
      return;
    }

    const scroller = scrollerRef.current;

    // 使用时间插值，而不是直接使用displayTime
    const interpolatedTime = updateInterpolatedTime();
    const loopTime = interpolatedTime % duration;

    let currentIdx = findCurrentLineIndex(lyrics, loopTime, duration);
    if (currentIdx === -1) { // Before the first lyric
        animationFrameRef.current = requestAnimationFrame(scrollStep);
        return;
    }

    const nextIdx = (currentIdx + 1) < lyrics.length ? currentIdx + 1 : -1;
    const loopNum = Math.floor(interpolatedTime / duration);
    
    
    const currentLineEl = lineRefs.current[loopNum * lyrics.length + currentIdx];
    if (!currentLineEl) {
        animationFrameRef.current = requestAnimationFrame(scrollStep);
        return;
    }

    let targetScrollTop = getCenterPosition(loopNum * lyrics.length + currentIdx);

    // Interpolate towards the next line based on time
    if (nextIdx !== -1) {
        const nextLineEl = lineRefs.current[loopNum * lyrics.length + nextIdx];
        if (nextLineEl) {
            const timeDiff = lyrics[nextIdx].time - lyrics[currentIdx].time;
            if (timeDiff > 0.01) {
                const progress = Math.max(0, Math.min(1, (loopTime - lyrics[currentIdx].time) / timeDiff));
                targetScrollTop = targetScrollTop + (getCenterPosition(loopNum * lyrics.length + nextIdx) - targetScrollTop) * progress;
            }
        }
    } else { // Interpolate towards the start of the next loop with smooth transition
         const nextLoopFirstLineEl = lineRefs.current[(loopNum + 1) * lyrics.length];
         if (nextLoopFirstLineEl) {
             const timeUntilEnd = duration - lyrics[currentIdx].time;
             if (timeUntilEnd > 0.01) {
                 const progress = Math.max(0, Math.min(1, (loopTime - lyrics[currentIdx].time) / timeUntilEnd));
                 // 使用 easeOutCubic 缓动函数，让循环过渡更平滑
                 const easeProgress = 1 - Math.pow(1 - progress, 3);
                 targetScrollTop = targetScrollTop + (getCenterPosition((loopNum + 1) * lyrics.length) - targetScrollTop) * easeProgress;
             }
         }
    }
    
    // 平滑插值滚动，避免直接跳跃
    const currentScrollTop = scroller.scrollTop;
    const distance = targetScrollTop - currentScrollTop;

    // 优化最小移动阈值，使用更精确的阈值
    if (Math.abs(distance) < 0.1) {
      // 距离很小时直接到达目标，避免抖动
      scroller.scrollTop = targetScrollTop;
      currentScrollTopRef.current = targetScrollTop;
      animationFrameRef.current = requestAnimationFrame(scrollStep);
      return;
    }

    // 动态调整缓动系数：距离越大，响应越快
    const absDistance = Math.abs(distance);
    let easingFactor = 0.08; // 基础缓动系数，更快的响应

    if (absDistance > 100) {
      easingFactor = 0.15; // 大距离时快速响应
    } else if (absDistance > 50) {
      easingFactor = 0.12; // 中等距离时适度响应
    } else if (absDistance < 5) {
      easingFactor = 0.05; // 小距离时精细调整
    }

    // 添加速度限制，避免过大的跳跃
    const maxStep = Math.max(5, absDistance * 0.3);
    const step = Math.min(Math.abs(distance * easingFactor), maxStep);
    const newScrollTop = currentScrollTop + (distance > 0 ? step : -step);
    
    programmaticScrollRef.current = true;
    scroller.scrollTop = newScrollTop;
    currentScrollTopRef.current = newScrollTop;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });

    animationFrameRef.current = requestAnimationFrame(scrollStep);

  }, [isPlaying, lyrics, duration, scrollTime, getCenterPosition, updateInterpolatedTime]);

  // 初始化时间插值
  useEffect(() => {
    interpolatedTimeRef.current = displayTime;
    targetTimeRef.current = displayTime;
    lastTimeUpdateRef.current = Date.now();
  }, [displayTime]);

  // 播放状态改变时重置插值状态
  useEffect(() => {
    if (!isPlaying) {
      // 暂停时同步时间
      interpolatedTimeRef.current = displayTime;
      targetTimeRef.current = displayTime;
    }
  }, [isPlaying, displayTime]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(scrollStep);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (interactionEndTimerRef.current) clearTimeout(interactionEndTimerRef.current);
    };
  }, [scrollStep]);

  // 监听音频重启，重置滚动状态（仅在真正的首次启动时）
  useEffect(() => {
    // 仅在真正的首次启动时重置（当前没有正在播放，且两个时间都为0）
    if (scrollTime === 0 && displayTime === 0 && !isPlaying) {
      console.log('[LyricsScroller] Initial startup - resetting scroll state');
      // 仅在首次启动时重置滚动状态
      isUserInteractingRef.current = false;
      programmaticScrollRef.current = false;
      currentScrollTopRef.current = 0;
      lastScrollTopRef.current = 0;

      // 重置滚动位置到顶部
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = 0;
      }
    }
  }, [scrollTime, displayTime, isPlaying]);

  // 监听displayTime变化，更新时间插值目标
  useEffect(() => {
    targetTimeRef.current = displayTime;
    // 在音频seek或者时间跳跃时，立即同步插值时间
    if (Math.abs(displayTime - interpolatedTimeRef.current) > 1.0) {
      interpolatedTimeRef.current = displayTime;
    }
  }, [displayTime]);

  // 音频循环检测：检测音频是否真的在循环播放
  const lastScrollTimeRef = useRef(0);
  useEffect(() => {
    // 检测scrollTime从大值突然变为0，说明音频循环了
    // 增加更严格的检测条件，避免误判
    if (scrollTime === 0 &&
        lastScrollTimeRef.current > duration * 0.9 &&
        isPlaying &&
        lastScrollTimeRef.current > 100) {
      console.log('[LyricsScroller] Audio loop detected, resetting interaction state only');
      // 只重置交互状态，保持滚动位置让歌词继续滚动
      isUserInteractingRef.current = false;
      programmaticScrollRef.current = false;
      // 不重置滚动位置，让歌词继续从当前位置滚动
    }
    lastScrollTimeRef.current = scrollTime;
  }, [scrollTime, isPlaying, duration]);


  // This function runs when the user STOPS interacting
  const handleInteractionEnd = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || lyrics.length === 0 || duration <= 0) {
      isUserInteractingRef.current = false;
      return;
    }

    // 用户交互结束时，同步插值时间到当前displayTime
    interpolatedTimeRef.current = displayTime;
    targetTimeRef.current = displayTime;

    // 1. 确定滚动方向
    const currentScrollTop = scroller.scrollTop;
    const scrollDirection = currentScrollTop > lastScrollTopRef.current ? 'down' : 'up';
    lastScrollTopRef.current = currentScrollTop;

    // 2. 根据滚动方向寻找合适的歌词行
    const centerViewport = currentScrollTop + scroller.clientHeight / 2;
    let targetIndex = -1;
    let minDistance = Infinity;

    // 首先找到距离中心最近的歌词行作为基准
    let closestToCenter = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < repeatedLyrics.length; i++) {
      const lineEl = lineRefs.current[i];
      const lyricLine = repeatedLyrics[i];
      if (lineEl && lyricLine?.text.trim()) {
        const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
        const distance = Math.abs(centerViewport - lineCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestToCenter = i;
        }
      }
    }

    if (closestToCenter === -1) {
      isUserInteractingRef.current = false;
      return;
    }

    // 3. 根据滚动方向寻找同一方向上最近的歌词
    if (scrollDirection === 'down') {
      // 向下滚动：寻找基准位置下方（索引更大）的歌词
      for (let i = closestToCenter; i < repeatedLyrics.length; i++) {
        const lineEl = lineRefs.current[i];
        const lyricLine = repeatedLyrics[i];
        if (lineEl && lyricLine?.text.trim()) {
          const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
          const distance = Math.abs(centerViewport - lineCenter);
          if (distance < minDistance) {
            minDistance = distance;
            targetIndex = i;
          }
          // 如果已经向下越过基准位置，就不再向上寻找
          if (lineCenter > centerViewport && minDistance !== Infinity) {
            break;
          }
        }
      }
    } else {
      // 向上滚动：寻找基准位置上方（索引更小）的歌词
      for (let i = closestToCenter; i >= 0; i--) {
        const lineEl = lineRefs.current[i];
        const lyricLine = repeatedLyrics[i];
        if (lineEl && lyricLine?.text.trim()) {
          const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
          const distance = Math.abs(centerViewport - lineCenter);
          if (distance < minDistance) {
            minDistance = distance;
            targetIndex = i;
          }
          // 如果已经向上越过基准位置，就不再向下寻找
          if (lineCenter < centerViewport && minDistance !== Infinity) {
            break;
          }
        }
      }
    }

    // 如果没有找到合适的，使用最近的基准
    if (targetIndex === -1) {
      targetIndex = closestToCenter;
    }

    // 4. 计算新的时间并跳转
    const lyricIndexInLoop = targetIndex % lyrics.length;
    const loopNum = Math.floor(targetIndex / lyrics.length);
    const newTime = (loopNum * duration) + lyrics[lyricIndexInLoop].time;
    onSeek(newTime);

    // 5. 释放交互锁，允许自动滚动恢复
    isUserInteractingRef.current = false;
  }, [duration, onSeek, lyrics, repeatedLyrics, isPlaying]);

  // 针对"明确的用户手势"（wheel/touchstart/mousedown）：强制进入交互状态
  const handleUserGestureStart = useCallback(() => {
    isUserInteractingRef.current = true;

    // 延迟更短，让用户感觉更跟手
    setTimeout(() => {
      handleInteractionEnd();
    }, isPlaying ? 50 : 15);
  }, [handleInteractionEnd, isPlaying]);

  // 针对 scroll 事件：若是程序性滚动则忽略；用户滚动则进入交互状态
  const handleScrollStart = useCallback(() => {
    if (programmaticScrollRef.current) {
      return;
    }

    // 设置交互状态
    isUserInteractingRef.current = true;

    // 延迟触发交互结束，给用户时间完成滚动
    if (interactionEndTimerRef.current) {
      clearTimeout(interactionEndTimerRef.current);
    }

    interactionEndTimerRef.current = setTimeout(() => {
      handleInteractionEnd();
    }, isPlaying ? 75 : 25);
  }, [handleInteractionEnd, isPlaying]);

  return (
    <div
      ref={scrollerRef}
      className="w-full h-full overflow-y-scroll no-scrollbar"
      onScroll={handleScrollStart}
      onWheel={handleUserGestureStart}
      onTouchStart={handleUserGestureStart}
      onMouseDown={handleUserGestureStart}
    >
      <div className="w-full py-[50vh]">
        {repeatedLyrics.map((line, index) => {
          const isCurrent = index === absoluteCurrentIndex;
          const isLeft = index % 2 === 0;
          const isBlank = !line.text.trim();

          return (
            <p
              key={`${line.time}-${index}`}
              ref={(el) => (lineRefs.current[index] = el)}
              className={`text-3xl font-semibold w-full px-16 ${
                isLeft ? 'text-left' : 'text-right'
              }`}
              style={{
                opacity: isBlank ? 0 : (isCurrent ? 1 : 0.5),
                color: isCurrent ? '#E2E8F0' : '#94A3B8',
                pointerEvents: isBlank ? 'none' : 'auto',
                userSelect: isBlank ? 'none' : 'auto',
                height: isBlank ? '5rem' : 'auto', // Give blank lines a consistent height
                paddingTop: isBlank ? '0' : '3rem', // 增加顶部间距
                paddingBottom: isBlank ? '0' : '3rem', // 增加底部间距
                lineHeight: isBlank ? '1' : '1.6', // 增加行高
                // 保持固定字体大小，只改变颜色和透明度
                fontSize: '2rem',
                willChange: isCurrent ? 'opacity' : 'auto',
                transition: 'opacity 0.3s ease',
              }}
            >
              {line.text || '\u00A0' /* Non-breaking space for layout */}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export default LyricsScroller;
