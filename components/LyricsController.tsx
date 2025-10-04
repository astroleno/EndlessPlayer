import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { LyricLine } from '../types';

interface LyricsControllerProps {
  lyrics: LyricLine[];
  currentTime: number;
  duration: number;
  scrollTime: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
}

const findCurrentLineIndex = (lyricLines: LyricLine[], time: number, durationParam: number): number => {
  if (!lyricLines || lyricLines.length === 0) return -1;
  const base = Math.max(1, durationParam || durationParam);
  const loopTime = time % base;
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

const LyricsController: React.FC<LyricsControllerProps> = ({ lyrics, currentTime, duration, scrollTime, onSeek, isPlaying }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const isUserInteractingRef = useRef(false);
  const interactionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const lastAutoScrollIndexRef = useRef<number>(-1);
  const programmaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const pointerInteractionRef = useRef(false);
  const lastLoopFromScrollRef = useRef(0);

  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const currentLineIndexRef = useRef(currentLineIndex);
  const [isInitialized, setIsInitialized] = useState(false);
  const repeatedLyrics = useMemo(() => Array(9).fill(null).flatMap(() => lyrics), [lyrics]);

  // 移动端检测
  const isIOS = typeof navigator !== 'undefined' ? /iPad|iPhone|iPod/.test(navigator.userAgent) : false;
  const isMobile = typeof navigator !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) : false;

  // 简化的滚动函数：直接滚动到目标行
  const scrollToLine = useCallback((index: number, options?: { immediate?: boolean }) => {
    requestAnimationFrame(() => {
      const lineEl = lineRefs.current[index];
      const scroller = scrollerRef.current;
      if (!lineEl || !scroller) return;

      programmaticScrollRef.current = true;
      if (programmaticReleaseTimerRef.current) {
        clearTimeout(programmaticReleaseTimerRef.current);
      }

      const lineTop = lineEl.offsetTop - (scroller.clientHeight / 2) + (lineEl.offsetHeight / 2);
      const immediate = options?.immediate === true;
      const behavior: ScrollBehavior = immediate || isIOS ? 'auto' : 'smooth';
      scroller.scrollTo({ top: lineTop, behavior });
      lastScrollTopRef.current = lineTop;

      programmaticReleaseTimerRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, immediate ? 50 : 350);
    });
  }, [isIOS]);

  // 处理交互结束：300ms后跳转到对应歌词
  const handleInteractionEnd = useCallback(() => {
    // 立即设置交互结束标记，防止重复调用
    isUserInteractingRef.current = false;

    if (!pointerInteractionRef.current) {
      scrollDirectionRef.current = 0;
      return;
    }

    const scroller = scrollerRef.current;
    if (!scroller || lyrics.length === 0 || duration <= 0) {
      pointerInteractionRef.current = false;
      return;
    }

    // 找到距离中心最近的歌词行
    const currentScrollTop = scroller.scrollTop;
    const centerViewport = currentScrollTop + scroller.clientHeight / 2;
    let bestMatch = -1;
    let bestDistance = Infinity;

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

    if (bestMatch === -1) {
      pointerInteractionRef.current = false;
      return;
    }

    let selectedIndex = bestMatch;
    const direction = scrollDirectionRef.current;

    if (direction > 0) {
      for (let i = bestMatch; i < repeatedLyrics.length; i++) {
        const lineEl = lineRefs.current[i];
        const lyricLine = repeatedLyrics[i];
        if (!lineEl || !lyricLine?.text.trim()) continue;
        const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
        if (lineCenter >= centerViewport - 2) {
          selectedIndex = i;
          break;
        }
      }
    } else if (direction < 0) {
      for (let i = bestMatch; i >= 0; i--) {
        const lineEl = lineRefs.current[i];
        const lyricLine = repeatedLyrics[i];
        if (!lineEl || !lyricLine?.text.trim()) continue;
        const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
        if (lineCenter <= centerViewport + 2) {
          selectedIndex = i;
          break;
        }
      }
    }

    // 计算对应的时间
    const lyricIndexInLoop = selectedIndex % lyrics.length;
    const calculatedLoop = Math.floor(selectedIndex / lyrics.length);
    const newTime = (calculatedLoop * duration) + lyrics[lyricIndexInLoop].time;

    scrollDirectionRef.current = 0;
    pointerInteractionRef.current = false;

    // 防抖：避免在100ms内重复调用
    const now = Date.now();
    if (now - lastSeekTimeRef.current < 100) {
      pointerInteractionRef.current = false;
      return;
    }
    lastSeekTimeRef.current = now;

    // 立即跳转，不延迟
    onSeek(newTime);
  }, [duration, onSeek, lyrics, repeatedLyrics]);

  // 统一的交互开始处理
  const handleInteractionStart = useCallback(() => {
    if (programmaticScrollRef.current) {
      return;
    }

    // 清除之前的定时器
    if (interactionEndTimerRef.current) {
      clearTimeout(interactionEndTimerRef.current);
    }

    isUserInteractingRef.current = true;
    lastAutoScrollIndexRef.current = -1;
    scrollDirectionRef.current = 0;

    // 设置300ms延迟
    interactionEndTimerRef.current = setTimeout(() => {
      handleInteractionEnd();
    }, 300);
  }, [handleInteractionEnd]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    const currentTop = scroller.scrollTop;

    if (programmaticScrollRef.current) {
      lastScrollTopRef.current = currentTop;
      return;
    }

    const isUserInitiated = pointerInteractionRef.current || isUserInteractingRef.current;
    if (!isUserInitiated) {
      lastScrollTopRef.current = currentTop;
      return;
    }

    const delta = currentTop - lastScrollTopRef.current;
    if (Math.abs(delta) > 1) {
      scrollDirectionRef.current = delta > 0 ? 1 : -1;
    }
    lastScrollTopRef.current = currentTop;

    handleInteractionStart();
  }, [handleInteractionStart]);

  const handlePointerInitiatedInteraction = useCallback(() => {
    pointerInteractionRef.current = true;
    handleInteractionStart();
  }, [handleInteractionStart]);

  // 同步currentLineIndex和ref
  useEffect(() => {
    currentLineIndexRef.current = currentLineIndex;
  }, [currentLineIndex]);

  // 初始化组件，确保只渲染一次
  useEffect(() => {
    if (!isInitialized && lyrics.length > 0) {
      setIsInitialized(true);
      pointerInteractionRef.current = false;
      lastAutoScrollIndexRef.current = -1;
      lastLoopFromScrollRef.current = 0;
    }
  }, [lyrics, isInitialized]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      lastScrollTopRef.current = scroller.scrollTop;
    }
  }, [isInitialized]);

  // 监听当前歌词变化，只在需要时滚动
  useEffect(() => {
    if (!isInitialized || !lyrics || lyrics.length === 0) return;

    const safeDuration = Math.max(1, duration);
    const newLineIndex = findCurrentLineIndex(lyrics, currentTime, safeDuration);

    if (newLineIndex >= 0 && newLineIndex !== currentLineIndexRef.current) {
      currentLineIndexRef.current = newLineIndex;
      setCurrentLineIndex(newLineIndex);
    }

    if (newLineIndex < 0 || isUserInteractingRef.current) {
      return;
    }

    const loopFromScroll = Math.floor(scrollTime / safeDuration);
    const targetIndex = loopFromScroll * lyrics.length + newLineIndex;

    if (lastAutoScrollIndexRef.current !== targetIndex) {
      const previousIndex = lastAutoScrollIndexRef.current;
      const loopChanged = loopFromScroll !== lastLoopFromScrollRef.current;
      const largeJump = previousIndex >= 0 && Math.abs(targetIndex - previousIndex) > lyrics.length;
      const shouldImmediate = loopChanged || largeJump;
      lastAutoScrollIndexRef.current = targetIndex;
      scrollToLine(targetIndex, { immediate: shouldImmediate });
      lastLoopFromScrollRef.current = loopFromScroll;
    }
  }, [currentTime, duration, scrollTime, scrollToLine, isInitialized, lyrics]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (interactionEndTimerRef.current) {
        clearTimeout(interactionEndTimerRef.current);
      }
      if (programmaticReleaseTimerRef.current) {
        clearTimeout(programmaticReleaseTimerRef.current);
      }
      pointerInteractionRef.current = false;
      programmaticScrollRef.current = false;
    };
  }, []);

  // 计算当前循环和索引
  const safeDuration = Math.max(1, duration);
  const loopCount = Math.floor(scrollTime / safeDuration);
  const absoluteCurrentIndex = currentLineIndex >= 0 ? loopCount * lyrics.length + currentLineIndex : -1;

  return (
    <div
      ref={scrollerRef}
      className={`w-full h-full overflow-y-scroll no-scrollbar ${isMobile ? 'touch-pan-y' : ''}`}
      style={{
        WebkitOverflowScrolling: 'touch',
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
        overscrollBehavior: 'contain'
      }}
      onScroll={handleScroll}
      onWheel={handlePointerInitiatedInteraction}
      onTouchStart={handlePointerInitiatedInteraction}
      onMouseDown={handlePointerInitiatedInteraction}
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
                height: isBlank ? '5rem' : 'auto',
                paddingTop: isBlank ? '0' : '3rem',
                paddingBottom: isBlank ? '0' : '3rem',
                lineHeight: isBlank ? '1' : '1.6',
                fontSize: isMobile ? (window.innerHeight < 667 ? '1.5rem' : '1.8rem') : '2rem',
                transition: 'opacity 0.3s ease',
                backfaceVisibility: 'hidden' as const,
                touchAction: 'pan-y'
              }}
            >
              {line.text || '\u00A0'}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export default LyricsController;
