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
    // 强制显示遮罩，不管什么情况
    if (!hasClicked) {
      setShouldShow(true);
      console.log('[AutoPlayGuard] Force showing guard');
    }
    setMounted(true);
  }, [hasClicked]);

  const handleClick = () => {
    console.log('[AutoPlayGuard] User clicked to start playback');
    setHasClicked(true);
    setShouldShow(false);
    onUserInteraction();
  };

  // 直接使用固定定位，不用createPortal
  if (!mounted || !shouldShow) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#202734',
        color: '#e2e8f0',
        zIndex: 2147483647,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        fontSize: '16px'
      }}
      onClick={handleClick}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '2.5rem',
          fontWeight: 600,
          color: '#e2e8f0',
          marginBottom: '0.5rem'
        }}>
          点击开始
        </div>
        <div style={{
          fontSize: '3rem',
          fontWeight: 700,
          color: '#e2e8f0',
          marginBottom: 0
        }}>
          心经
        </div>
      </div>
    </div>
  );
}
