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

  // 移动端性能优化相关
  const lastScreenParamsRef = useRef<any>(null);
  const screenParamsUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 时间插值相关
  const interpolatedTimeRef = useRef(displayTime);
  const lastTimeUpdateRef = useRef(Date.now());
  const targetTimeRef = useRef(displayTime);
  
  
  // 移动端检测优化 - 安全检查
  const isIOS = typeof navigator !== 'undefined' ? /iPad|iPhone|iPod/.test(navigator.userAgent) : false;
  const isMobile = typeof navigator !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) : false;

  // 获取屏幕相关的响应式参数（带性能优化）
  const getScreenParams = useCallback(() => {
    // 安全检查：确保window对象可用
    if (typeof window === 'undefined') {
      return {
        screenHeight: 800,
        screenWidth: 375,
        usableHeight: 640,
        isLandscape: false,
        isSmallScreen: false,
        baseStep: 8,
        maxStep: 32,
        smallDistanceThreshold: 12,
        mediumDistanceThreshold: 96,
        largeDistanceThreshold: 192,
        lastUpdate: Date.now()
      };
    }

    // 性能优化：缓存屏幕参数，避免频繁计算
    const now = Date.now();
    const cachedParams = lastScreenParamsRef.current;

    // 如果缓存时间不超过1秒，直接返回缓存值
    if (cachedParams && cachedParams.lastUpdate && (now - cachedParams.lastUpdate) < 1000) {
      return cachedParams;
    }

    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    const isLandscape = screenWidth > screenHeight;
    const usableHeight = screenHeight * (isMobile ? 0.8 : 0.9); // 移动端考虑底部导航栏等
    const isSmallScreen = screenHeight < 667; // iPhone SE 等小屏幕

    // 基于屏幕高度的相对步进参数
    const baseStep = Math.max(usableHeight * 0.015, 4); // 最小4px，最大基于屏幕高度的1.5%
    const maxStep = Math.max(usableHeight * 0.08, 16); // 最小16px，最大基于屏幕高度的8%
    const smallDistanceThreshold = usableHeight * 0.02; // 小距离阈值
    const mediumDistanceThreshold = usableHeight * 0.15; // 中等距离阈值
    const largeDistanceThreshold = usableHeight * 0.3; // 大距离阈值

    const params = {
      screenHeight,
      screenWidth,
      usableHeight,
      isLandscape,
      isSmallScreen,
      baseStep,
      maxStep,
      smallDistanceThreshold,
      mediumDistanceThreshold,
      largeDistanceThreshold,
      lastUpdate: now
    };

    // 更新缓存
    lastScreenParamsRef.current = params;
    return params;
  }, [isMobile]);

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

      // 大幅提高桌面端时间插值，解决卡顿
      const absTimeDiff = Math.abs(timeDiff);
      let smoothingFactor = 0.7; // 大幅提高基础时间跟踪系数

      if (absTimeDiff > 5.0) {
        smoothingFactor = isMobile ? 0.6 : 0.9; // 桌面端极高时间跟踪
      } else if (absTimeDiff > 2.0) {
        smoothingFactor = isMobile ? 0.45 : 0.8; // 桌面端快速时间跟踪
      } else if (absTimeDiff < 0.1) {
        smoothingFactor = isMobile ? 0.15 : 0.6; // 桌面端提高小时间差响应
      }

      interpolatedTimeRef.current += timeDiff * smoothingFactor;

      // 优化防漂移逻辑：使用更小的阈值和渐进式修正
      if (Math.abs(interpolatedTimeRef.current - targetTime) > 0.1) {
        // 使用渐进式修正而不是直接重置
        const correctionFactor = 0.25; // 大幅增加修正系数，减少阻力
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

    // 使用屏幕相关的响应式参数优化滚动
    const screenParams = getScreenParams();
    const absDistance = Math.abs(distance);

    // 大幅提高桌面端缓动系数，解决卡顿问题
    let easingFactor = 0.6; // 大幅提高基础缓动系数

    if (absDistance > screenParams.largeDistanceThreshold) {
      easingFactor = isMobile ? 0.55 : 0.8; // 桌面端极高响应
    } else if (absDistance > screenParams.mediumDistanceThreshold) {
      easingFactor = isMobile ? 0.40 : 0.7; // 桌面端高响应
    } else if (absDistance < screenParams.smallDistanceThreshold) {
      easingFactor = isMobile ? 0.12 : 0.5; // 桌面端提高小距离响应
    }

    // 桌面端移除步进限制，移动端保持响应式参数
    let step;
    if (isMobile) {
      const dynamicMaxStep = Math.max(screenParams.baseStep, Math.min(screenParams.maxStep, absDistance * 0.7));
      step = Math.min(Math.abs(distance * easingFactor), dynamicMaxStep);
    } else {
      // 桌面端直接使用插值，不限制步长
      step = Math.abs(distance * easingFactor);
    }
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
      if (screenParamsUpdateTimerRef.current) clearTimeout(screenParamsUpdateTimerRef.current);
    };
  }, [scrollStep]);

  // 监听屏幕旋转和尺寸变化，更新屏幕参数
  useEffect(() => {
    const handleOrientationChange = () => {
      // 清除旧的定时器
      if (screenParamsUpdateTimerRef.current) {
        clearTimeout(screenParamsUpdateTimerRef.current);
      }

      // 延迟更新屏幕参数，等待浏览器完成方向切换
      screenParamsUpdateTimerRef.current = setTimeout(() => {
        // 强制更新缓存的屏幕参数
        lastScreenParamsRef.current = getScreenParams();
        console.log('[LyricsScroller] Screen parameters updated due to orientation change');
      }, 300);
    };

    const handleResize = () => {
      // 防抖处理窗口大小变化
      if (screenParamsUpdateTimerRef.current) {
        clearTimeout(screenParamsUpdateTimerRef.current);
      }

      screenParamsUpdateTimerRef.current = setTimeout(() => {
        lastScreenParamsRef.current = getScreenParams();
        console.log('[LyricsScroller] Screen parameters updated due to resize');
      }, 200);
    };

    // 添加事件监听
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
      if (screenParamsUpdateTimerRef.current) {
        clearTimeout(screenParamsUpdateTimerRef.current);
      }
    };
  }, [getScreenParams]);

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

    // 1. 获取当前滚动位置和视口中心
    const currentScrollTop = scroller.scrollTop;
    const centerViewport = currentScrollTop + scroller.clientHeight / 2;
    const screenParams = getScreenParams();

    // 2. 寻找距离视口中心最近的歌词行，设置合理的容差范围
    let bestMatch = -1;
    let bestDistance = Infinity;
    const tolerance = screenParams.usableHeight * 0.15; // 15%的可用高度作为容差

    // 优化的搜索策略：优先在当前循环中寻找
    const currentLoop = Math.floor(displayTime / duration);
    const startIndex = Math.max(0, currentLoop * lyrics.length - lyrics.length);
    const endIndex = Math.min(repeatedLyrics.length, (currentLoop + 2) * lyrics.length);

    for (let i = startIndex; i < endIndex; i++) {
      const lineEl = lineRefs.current[i];
      const lyricLine = repeatedLyrics[i];
      if (lineEl && lyricLine?.text.trim()) {
        const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
        const distance = Math.abs(centerViewport - lineCenter);

        // 在容差范围内优先选择，否则选择最近的
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        } else if (bestMatch === -1 && distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        }
      }
    }

    // 如果在当前循环附近没找到合适匹配，扩大搜索范围
    if (bestMatch === -1) {
      for (let i = 0; i < repeatedLyrics.length; i++) {
        const lineEl = lineRefs.current[i];
        const lyricLine = repeatedLyrics[i];
        if (lineEl && lyricLine?.text.trim()) {
          const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
          const distance = Math.abs(centerViewport - lineCenter);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = i;
          }
        }
      }
    }

    if (bestMatch === -1) {
      // 如果还是没找到，直接释放交互锁，避免跳转
      isUserInteractingRef.current = false;
      return;
    }

    // 3. 安全的时间计算，添加多重验证
    const lyricIndexInLoop = bestMatch % lyrics.length;
    const calculatedLoop = Math.floor(bestMatch / lyrics.length);

    // 验证计算结果的合理性
    if (lyricIndexInLoop < 0 || lyricIndexInLoop >= lyrics.length) {
      console.warn('[LyricsScroller] Invalid lyric index calculated:', lyricIndexInLoop);
      isUserInteractingRef.current = false;
      return;
    }

    // 计算新时间，并确保在合理范围内
    const newTime = (calculatedLoop * duration) + lyrics[lyricIndexInLoop].time;

    // 验证时间值的合理性
    if (newTime < 0 || isNaN(newTime) || !isFinite(newTime)) {
      console.warn('[LyricsScroller] Invalid time calculated:', newTime);
      isUserInteractingRef.current = false;
      return;
    }

    // 检查时间跳跃是否过大，可能是计算错误
    const timeDifference = Math.abs(newTime - displayTime);
    const maxReasonableJump = duration * 2; // 最多允许跳跃2个循环
    if (timeDifference > maxReasonableJump) {
      console.warn('[LyricsScroller] Excessive time jump detected:', {
        from: displayTime,
        to: newTime,
        difference: timeDifference
      });
      // 如果跳跃过大，使用更保守的时间计算
      const conservativeLoop = Math.max(0, Math.min(calculatedLoop, currentLoop + 1));
      const conservativeTime = (conservativeLoop * duration) + lyrics[lyricIndexInLoop].time;
      onSeek(conservativeTime);
    } else {
      onSeek(newTime);
    }

    // 4. 释放交互锁，允许自动滚动恢复
    isUserInteractingRef.current = false;
  }, [duration, onSeek, lyrics, repeatedLyrics, isPlaying, displayTime, getScreenParams]);

  // 针对"明确的用户手势"（wheel/touchstart/mousedown）：强制进入交互状态
  const handleUserGestureStart = useCallback(() => {
    isUserInteractingRef.current = true;

    // 简单有效的延迟机制
    const delay = isPlaying ? 300 : 200;
    setTimeout(() => {
      handleInteractionEnd();
    }, delay);
  }, [handleInteractionEnd]);

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

    // 简单的滚动延迟
    const scrollDelay = isPlaying ? 400 : 250;
    interactionEndTimerRef.current = setTimeout(() => {
      handleInteractionEnd();
    }, scrollDelay);
  }, [handleInteractionEnd]);

  return (
    <div
      ref={scrollerRef}
      className={`w-full h-full overflow-y-scroll no-scrollbar ${
        isMobile ? 'touch-pan-y' : ''
      }`}
      style={{
        // 移动端性能优化
        WebkitOverflowScrolling: 'touch',
        WebkitTransform: 'translateZ(0)', // 启用硬件加速
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
        // 防止iOS橡皮筋效果
        overscrollBehavior: 'contain'
      }}
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
                // 移动端响应式字体大小
                fontSize: isMobile ? (isSmallScreen ? '1.5rem' : '1.8rem') : '2rem',
                // 移动端性能优化
                willChange: isCurrent ? 'opacity, transform' : 'auto',
                transition: isMobile ? 'opacity 0.2s ease' : 'opacity 0.3s ease',
                // 移动端优化：减少重绘
                backfaceVisibility: 'hidden' as const,
                // 触摸优化
                touchAction: 'pan-y'
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
