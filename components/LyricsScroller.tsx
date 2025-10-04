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
  const smoothingFactor = 0.01; // 平滑度系数，降低到更小的值
  const lastScrollTopRef = useRef(0); // 用于检测滚动方向

  const repeatedLyrics = useMemo(() => Array(9).fill(null).flatMap(() => lyrics), [lyrics]);
  const currentLineIndex = findCurrentLineIndex(lyrics, displayTime, duration);
  const loopCount = duration > 0 ? Math.floor(scrollTime / duration) : 0;
  const absoluteCurrentIndex = currentLineIndex >= 0 ? loopCount * lyrics.length + currentLineIndex : -1;
  
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
    const loopTime = displayTime % duration;
    
    let currentIdx = findCurrentLineIndex(lyrics, loopTime, duration);
    if (currentIdx === -1) { // Before the first lyric
        animationFrameRef.current = requestAnimationFrame(scrollStep);
        return;
    }

    const nextIdx = (currentIdx + 1) < lyrics.length ? currentIdx + 1 : -1;
    const loopNum = Math.floor(scrollTime / duration);
    
    const getCenterPosition = (el: HTMLElement) => el.offsetTop - (scroller.clientHeight / 2) + (el.offsetHeight / 2);
    
    const currentLineEl = lineRefs.current[loopNum * lyrics.length + currentIdx];
    if (!currentLineEl) {
        animationFrameRef.current = requestAnimationFrame(scrollStep);
        return;
    }

    let targetScrollTop = getCenterPosition(currentLineEl);

    // Interpolate towards the next line based on time
    if (nextIdx !== -1) {
        const nextLineEl = lineRefs.current[loopNum * lyrics.length + nextIdx];
        if (nextLineEl) {
            const timeDiff = lyrics[nextIdx].time - lyrics[currentIdx].time;
            if (timeDiff > 0.01) {
                const progress = Math.max(0, Math.min(1, (loopTime - lyrics[currentIdx].time) / timeDiff));
                targetScrollTop = targetScrollTop + (getCenterPosition(nextLineEl) - targetScrollTop) * progress;
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
                 targetScrollTop = targetScrollTop + (getCenterPosition(nextLoopFirstLineEl) - targetScrollTop) * easeProgress;
             }
         }
    }
    
  // 平滑插值滚动，避免直接跳跃
  const currentScrollTop = scroller.scrollTop;
  const distance = targetScrollTop - currentScrollTop;
  
  // 添加最小移动阈值，避免微小抖动
  if (Math.abs(distance) < 0.5) {
    // 距离很小时直接到达目标，避免抖动
    scroller.scrollTop = targetScrollTop;
    currentScrollTopRef.current = targetScrollTop;
    animationFrameRef.current = requestAnimationFrame(scrollStep);
    return;
  }
  
  // 使用更平滑的插值，确保连续滚动
  const smoothingFactor = 0.08; // 增加平滑度
  let newScrollTop = currentScrollTop + distance * smoothingFactor;
    
    if (nextIdx !== -1 && lyrics[nextIdx]) {
      // 有下一行信息时，基于时间间隔计算精确步进
      const timeDiff = lyrics[nextIdx].time - lyrics[currentIdx].time;
      const currentTimeInSegment = loopTime - lyrics[currentIdx].time;
      const progress = Math.max(0, Math.min(1, currentTimeInSegment / timeDiff));
      
      // 计算目标位置（当前行到下一行的插值）
      const nextLineEl = lineRefs.current[loopNum * lyrics.length + nextIdx];
      if (nextLineEl) {
        const getCenterPosition = (el: HTMLElement) => el.offsetTop - (scroller.clientHeight / 2) + (el.offsetHeight / 2);
        const currentLineCenter = getCenterPosition(currentLineEl);
        const nextLineCenter = getCenterPosition(nextLineEl);
        const targetPosition = currentLineCenter + (nextLineCenter - currentLineCenter) * progress;
        
        // 基于时间间隔计算每帧应该移动的距离
        const framesPerSecond = 60; // 假设60fps
        const totalFrames = timeDiff * framesPerSecond;
        const pixelsPerFrame = Math.abs(targetPosition - currentScrollTop) / totalFrames;
        
        // 限制每帧最大移动距离，避免过快
        const maxPixelsPerFrame = 2; // 每帧最多移动2px
        const actualPixelsPerFrame = Math.min(pixelsPerFrame, maxPixelsPerFrame);
        
        newScrollTop = currentScrollTop + (targetPosition - currentScrollTop > 0 ? actualPixelsPerFrame : -actualPixelsPerFrame);
      } else {
        newScrollTop = currentScrollTop + distance * 0.08;
      }
    } else {
      // 没有下一行信息时，使用传统插值
      newScrollTop = currentScrollTop + distance * 0.08;
    }
    
    programmaticScrollRef.current = true;
    scroller.scrollTop = newScrollTop;
    currentScrollTopRef.current = newScrollTop;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });

    animationFrameRef.current = requestAnimationFrame(scrollStep);

  }, [isPlaying, lyrics, displayTime, duration, scrollTime, smoothingFactor]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(scrollStep);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (interactionEndTimerRef.current) clearTimeout(interactionEndTimerRef.current);
    };
  }, [scrollStep]);


  // This function runs when the user STOPS interacting
  const handleInteractionEnd = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || lyrics.length === 0 || duration <= 0) {
      isUserInteractingRef.current = false;
      return;
    }

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
                transform: isBlank ? 'scale(1)' : `scale(${isCurrent ? 1.05 : 1})`,
                color: isCurrent ? '#E2E8F0' : '#94A3B8',
                pointerEvents: isBlank ? 'none' : 'auto',
                userSelect: isBlank ? 'none' : 'auto',
                height: isBlank ? '5rem' : 'auto',
                paddingTop: isBlank ? '0' : '3rem',
                paddingBottom: isBlank ? '0' : '3rem',
                // 防止左右晃动
                transformOrigin: 'center',
                willChange: 'transform, opacity',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden'
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
