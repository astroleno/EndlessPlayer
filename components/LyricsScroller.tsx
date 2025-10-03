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

const INTERACTION_RESUME_DELAY = 350; // ms（适度延长，避免播放时频繁“抢回”控制权）

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

  const repeatedLyrics = useMemo(() => Array(50).fill(null).flatMap(() => lyrics), [lyrics]);
  const currentLineIndex = findCurrentLineIndex(lyrics, displayTime, duration);
  const loopCount = duration > 0 ? Math.floor(scrollTime / duration) : 0;
  const absoluteCurrentIndex = currentLineIndex >= 0 ? loopCount * lyrics.length + currentLineIndex : -1;
  
  // This is the core animation loop for automatic scrolling
  const scrollStep = useCallback(() => {
    if (isUserInteractingRef.current || !isPlaying || !scrollerRef.current || lyrics.length < 2) {
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
    } else { // Interpolate towards the start of the next loop
         const nextLoopFirstLineEl = lineRefs.current[(loopNum + 1) * lyrics.length];
         if (nextLoopFirstLineEl) {
             const timeUntilEnd = duration - lyrics[currentIdx].time;
             if (timeUntilEnd > 0.01) {
                 const progress = Math.max(0, Math.min(1, (loopTime - lyrics[currentIdx].time) / timeUntilEnd));
                 targetScrollTop = targetScrollTop + (getCenterPosition(nextLoopFirstLineEl) - targetScrollTop) * progress;
             }
         }
    }
    
    programmaticScrollRef.current = true;
    scroller.scrollTop = targetScrollTop;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });

    animationFrameRef.current = requestAnimationFrame(scrollStep);

  }, [isPlaying, lyrics, displayTime, duration, scrollTime]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(scrollStep);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [scrollStep]);


  // This function runs when the user STOPS interacting
  const handleInteractionEnd = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || lyrics.length === 0 || duration <= 0) {
      isUserInteractingRef.current = false;
      return;
    }
    
    // 1. Find the closest visible line to the viewport center
    const centerViewport = scroller.scrollTop + scroller.clientHeight / 2;
    let closestIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < repeatedLyrics.length; i++) {
      const lineEl = lineRefs.current[i];
      const lyricLine = repeatedLyrics[i];
      if (lineEl && lyricLine?.text.trim()) { // Only consider lines with text
        const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
        const distance = Math.abs(centerViewport - lineCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      const targetEl = lineRefs.current[closestIndex];
      if (targetEl) {
        // 2. Instantly "snap" the view to the target line to prevent rebound
        const targetScrollTop = targetEl.offsetTop - (scroller.clientHeight / 2) + (targetEl.offsetHeight / 2);
        programmaticScrollRef.current = true;
        scroller.scrollTop = targetScrollTop;
        requestAnimationFrame(() => { programmaticScrollRef.current = false; });
        
        // 3. Calculate the new time and seek the audio
        const lyricIndexInLoop = closestIndex % lyrics.length;
        const loopNum = Math.floor(closestIndex / lyrics.length);
        const newTime = (loopNum * duration) + lyrics[lyricIndexInLoop].time;
        onSeek(newTime);
      }
    }

    // 4. Release the interaction lock to allow automatic scrolling to resume
    isUserInteractingRef.current = false;
  }, [duration, onSeek, lyrics, repeatedLyrics]);

  // 针对“明确的用户手势”（wheel/touchstart/mousedown）：强制进入交互状态
  const handleUserGestureStart = useCallback(() => {
    isUserInteractingRef.current = true;
    if (interactionEndTimerRef.current) {
      clearTimeout(interactionEndTimerRef.current);
    }
    interactionEndTimerRef.current = setTimeout(handleInteractionEnd, INTERACTION_RESUME_DELAY);
  }, [handleInteractionEnd]);

  // 针对 scroll 事件：若是程序性滚动则忽略；用户滚动则进入交互状态
  const handleScrollStart = useCallback(() => {
    if (programmaticScrollRef.current) return;
    isUserInteractingRef.current = true;
    if (interactionEndTimerRef.current) {
      clearTimeout(interactionEndTimerRef.current);
    }
    interactionEndTimerRef.current = setTimeout(handleInteractionEnd, INTERACTION_RESUME_DELAY);
  }, [handleInteractionEnd]);

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
              className={`transition-all duration-300 ease-in-out text-3xl font-semibold w-full px-16 py-8 ${
                isLeft ? 'text-left' : 'text-right'
              }`}
              style={{
                opacity: isBlank ? 0 : (isCurrent ? 1 : 0.5),
                transform: isBlank ? 'scale(1)' : `scale(${isCurrent ? 1.05 : 1})`,
                color: isCurrent ? '#E2E8F0' : '#94A3B8',
                pointerEvents: isBlank ? 'none' : 'auto',
                userSelect: isBlank ? 'none' : 'auto',
                height: isBlank ? '5rem' : 'auto', // Give blank lines a consistent height
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
