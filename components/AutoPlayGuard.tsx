"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface AutoPlayGuardProps {
  onUserInteraction: () => void;
  isReady: boolean;
  isPlaying: boolean;
}

export default function AutoPlayGuard({ onUserInteraction, isReady, isPlaying }: AutoPlayGuardProps) {
  const [mounted, setMounted] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // 检测是否需要显示引导 - 所有设备都需要用户交互才能开始播放
    const checkShouldShow = () => {
      // 如果用户已经点击过，不再显示遮罩
      if (hasClicked) {
        setShouldShow(false);
        return;
      }
      // 只要音频未就绪或未播放，就显示遮罩
      const needsInteraction = !isReady || !isPlaying;
      setShouldShow(needsInteraction);
    };

    // 立即显示遮罩（所有设备都需要用户交互）
    if (!hasClicked) {
      setShouldShow(true);
    }
    
    // 监听音频状态变化
    const interval = setInterval(checkShouldShow, 200);
    
    return () => clearInterval(interval);
  }, [isReady, isPlaying, hasClicked]);

  const handleClick = () => {
    console.log('[AutoPlayGuard] User clicked to start playback');
    setHasClicked(true);
    setShouldShow(false);
    onUserInteraction();
  };

  if (!mounted || !shouldShow) return null;

  return createPortal(
    <div className="autoplay-guard" onClick={handleClick}>
      <div className="autoplay-content">
        <div className="autoplay-text">点击开始</div>
        <div className="autoplay-text">心经</div>
      </div>
      <style jsx global>{`
        .autoplay-guard {
          position: fixed;
          inset: 0;
          height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #202734;
          color: #e2e8f0;
          z-index: 2147483647;
          cursor: pointer;
          user-select: none;
        }
        
        .autoplay-content {
          text-align: center;
        }
        
        .autoplay-text {
          font-size: 2.5rem;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 0.5rem;
        }
        
        .autoplay-text:last-child {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 0;
        }
        
        /* 移动端优化 */
        @media (max-width: 768px) {
          .autoplay-text {
            font-size: 2rem;
          }
          
          .autoplay-text:last-child {
            font-size: 2.5rem;
          }
        }
        
        /* 确保遮罩在最顶层 */
        .autoplay-guard * {
          pointer-events: none;
        }
        
        .autoplay-guard {
          pointer-events: auto;
        }
      `}</style>
    </div>,
    document.body
  );
}
