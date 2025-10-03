"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function OrientationGuard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(orientation: landscape)");
    const isMobile = () =>
      window.matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const apply = () => {
      const landscape = mq.matches || screen.width > screen.height;
      const mobile = isMobile();
      // 仅在“移动设备横屏”时加类，避免桌面端误判
      const flag = mobile && landscape;
      document.documentElement.classList.toggle("is-mobile-landscape", flag);
    };
    mq.addEventListener?.("change", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    apply();
    return () => {
      mq.removeEventListener?.("change", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="landscape-mask">
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>请竖屏查看</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Rotate your device to portrait</div>
      </div>
      <style jsx global>{`
        html, body { height: 100%; }
        .landscape-mask{
          position: fixed; inset: 0; height: 100dvh;
          display: none; align-items: center; justify-content: center;
          background: rgba(0,0,0,.88); color: #fff;
          z-index: 2147483647; pointer-events: auto;
        }
        /* 仅移动端横屏显示遮罩：通过 JS 加在 <html> 上的类控制 */
        .is-mobile-landscape .landscape-mask{ display: flex; }
      `}</style>
    </div>,
    document.body
  );
}


