import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LRC_LYRICS } from './constants';
import useLyrics from './hooks/useLyrics';
import LyricsScroller from './components/LyricsScroller';
import AudioPlayer from './components/AudioPlayer';
import AutoPlayGuard from './components/AutoPlayGuard';
import type { LyricLine } from './types';

// 说明：默认给出一个预估时长，待真实音频元数据加载后再更新
const MOCK_DURATION = 364; // ~6 分 4 秒

const findCurrentLineIndex = (lyricLines: LyricLine[], time: number, durationParam: number): number => {
  if (!lyricLines || lyricLines.length === 0) return -1;
  const base = Math.max(1, durationParam || MOCK_DURATION);
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

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // Display time (loops 0 to duration)
  const [scrollTime, setScrollTime] = useState(0); // Absolute time for scrolling
  const [duration, setDuration] = useState(MOCK_DURATION);
  const [audioSrc, setAudioSrc] = useState('');
  const [isIntroPlaying, setIsIntroPlaying] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [audioRestartCount, setAudioRestartCount] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loopCountRef = useRef(0);
  // 修复：添加标记避免重复循环检测
  const isAudioEndedRef = useRef(false);
  // 当音频尚未就绪时，缓存一次待应用的绝对跳转时间（单位：秒）
  const pendingSeekAbsoluteTimeRef = useRef<number | null>(null);
  // 记录最近一次期望跳转到的显示时间（用于抑制 timeupdate 抢写）
  const lastSeekTargetDisplayTimeRef = useRef<number | null>(null);

  const lyrics = useLyrics(LRC_LYRICS);

  // 添加调试日志
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setDebugLogs(prev => [...prev.slice(-4), logMessage]); // 只保留最近5条日志
  }, []);

  useEffect(() => {
    // 检测是否为移动端
    const checkMobile = () => {
      const userAgent = navigator.userAgent;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      
      // 简化移动端检测逻辑，优先使用User Agent
      const mobile = isMobileDevice || (isTouchDevice && isSmallScreen);
      console.log('[App] Mobile detection:', { 
        userAgent: userAgent.substring(0, 50), 
        isMobileDevice, 
        isTouchDevice, 
        isSmallScreen, 
        mobile 
      });
      setIsMobile(mobile);
      return mobile;
    };

    const isMobileDevice = checkMobile();

    // 统一使用合并音频文件
    try {
      const audioPath = '/audio/心经_2.mp3';
      console.log('[App] Setting audio source:', audioPath);
      setAudioSrc(audioPath);
      
      // 初始状态保持同步：都从0开始，避免scrollTime和currentTime错位
      setScrollTime(0);
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      // 其余真实时长会在 onLoadedMetadata 中更新
    } catch (error) {
      console.error('[Audio] Failed to set real audio source:', error);
    }
  }, []); // 确保只运行一次

  const handleUserInteraction = useCallback(() => {
    addDebugLog(`用户交互触发，移动端: ${isMobile}`);
    console.log('[App] User interaction triggered, isMobile:', isMobile);
    console.log('[App] Audio state before interaction:', { isReady, audioSrc, hasUserInteracted });
    setHasUserInteracted(true);
    setIsIntroPlaying(true);

    // 重置滚动状态，确保初始同步
    setScrollTime(0);
    setCurrentTime(0);
    loopCountRef.current = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;

    const mainAudio = audioRef.current;

    // 简化逻辑：直接播放合并音频文件
    console.log('[App] Attempting to play merged audio');
    if (mainAudio) {
      mainAudio.play()
        .then(() => {
          addDebugLog('合并音频播放成功');
          console.log('[App] Merged audio started successfully');
        })
        .catch(e => {
          addDebugLog(`合并音频播放失败: ${e.message}`);
          console.error('[Audio] Merged audio playback failed:', e);
        });
    } else {
      addDebugLog('音频元素不存在');
      console.log('[App] Main audio element not found');
    }
  }, [isReady, isMobile]);

  const handleIntroEnd = useCallback(() => {
    console.log('[App] Intro audio ended - no action needed for merged audio');
    setIsIntroPlaying(false);
    // 由于使用合并音频，不需要额外处理
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;
    if (isPlaying) {
      try {
        audio.pause();
      } catch (e) {
        console.error('[Audio] Pause failed:', e);
      }
    } else {
      audio.play().catch(e => console.error('[Audio] Playback failed:', e));
    }
  }, [isPlaying, isReady]);

  const handleSeek = useCallback((absoluteTime: number) => {
    // 进入"正在拖动/定位"状态，避免自动滚动干扰
    isSeekingRef.current = true;
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    // 修复：增加锁定时间，确保用户交互完成
    const timeoutDuration = isPlaying ? 1000 : 500;
    seekTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
      lastSeekTargetDisplayTimeRef.current = null;
    }, timeoutDuration);

    // 始终先更新界面显示（即便音频未就绪，也能看到位置变化）
    const safeDuration = Math.max(1, duration);
    const displayTime = absoluteTime % safeDuration;
    setCurrentTime(displayTime);
    setScrollTime(absoluteTime);
    loopCountRef.current = Math.floor(absoluteTime / safeDuration);
    lastSeekTargetDisplayTimeRef.current = displayTime;

    // 若音频已就绪，立刻跳转；否则缓存待跳转时间，等就绪后应用
    try {
      const audio = audioRef.current;
      if (audio && isReady) {
        audio.currentTime = displayTime;
        pendingSeekAbsoluteTimeRef.current = null;
      } else {
        pendingSeekAbsoluteTimeRef.current = absoluteTime;
      }
    } catch (err) {
      console.error('[Audio] Seek failed:', err);
    }
  }, [duration, isReady, isPlaying]);
  
  const handleTimeUpdate = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (!audio) return;

    const newDisplayTime = audio.currentTime;

    // 在seeking状态下，允许有限度的时间更新以保持UI响应
    if (isSeekingRef.current) {
      // 如果用户正在seeking，只在音频时间明显偏离目标时才更新
      const targetDisplayTime = lastSeekTargetDisplayTimeRef.current;
      if (targetDisplayTime != null && Math.abs(newDisplayTime - targetDisplayTime) > 0.5) {
        // 音频时间偏离目标太远，可能是音频继续播放导致的，需要同步
        setCurrentTime(newDisplayTime);
        // 更新scrollTime但保持用户选择的循环位置
        setScrollTime(loopCountRef.current * duration + newDisplayTime);
      }
      return;
    }

    // 修复：重置音频结束标记，允许后续循环检测
    if (isAudioEndedRef.current && newDisplayTime > 1.0) {
      isAudioEndedRef.current = false;
      console.log('[App] Resetting audio ended flag, allowing future loop detection');
    }

    // 正常情况下更新时间
    // 修复：避免在 handleAudioEnded 处理后重复检测循环
    const isLooping = !isAudioEndedRef.current &&
                     ((newDisplayTime < currentTime && currentTime > duration * 0.9) ||
                      (newDisplayTime < 0.5 && currentTime > duration * 0.9 && loopCountRef.current > 0));

    if (isLooping) {
      console.log('[App] Loop detected in timeUpdate, incrementing loop count:', loopCountRef.current, '->', loopCountRef.current + 1);
      loopCountRef.current++;
    }

    setCurrentTime(newDisplayTime);
    setScrollTime(loopCountRef.current * duration + newDisplayTime);
  }, [currentTime, duration]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    // 当真实音频元数据加载完成后，更新时长，确保歌词滚动与进度条匹配
    try {
      const target = e.currentTarget;
      const realDuration = Math.max(1, Math.floor(target.duration));
      setDuration(realDuration);
      // 延迟调整到第5轮，等音频开始播放后再调整
      setTimeout(() => {
        if (isPlaying || isIntroPlaying) {
          setScrollTime(realDuration * 5);
          loopCountRef.current = 5;
        }
      }, 500);
      // 若存在待应用的跳转时间，则按照新时长重新计算并应用到音频
      const pendingAbs = pendingSeekAbsoluteTimeRef.current;
      if (pendingAbs != null) {
        const displayTime = pendingAbs % realDuration;
        try {
          if (audioRef.current) audioRef.current.currentTime = displayTime;
          setCurrentTime(displayTime);
          loopCountRef.current = Math.floor(pendingAbs / realDuration);
          pendingSeekAbsoluteTimeRef.current = null;
          lastSeekTargetDisplayTimeRef.current = displayTime;
        } catch (seekErr) {
          console.error('[Audio] Failed to apply pending seek after metadata load:', seekErr);
        }
      }
    } catch (err) {
      console.error('[Audio] Failed to read metadata:', err);
    }
  }, []);

  const handleCanPlay = () => {
    try {
      setIsReady(true);
      // 音频可播放时，如有待跳转时间则立刻应用
      const pendingAbs = pendingSeekAbsoluteTimeRef.current;
      const audio = audioRef.current;
      const safeDuration = Math.max(1, duration);
      if (pendingAbs != null && audio) {
        const displayTime = pendingAbs % safeDuration;
        audio.currentTime = displayTime;
        setCurrentTime(displayTime);
        loopCountRef.current = Math.floor(pendingAbs / safeDuration);
        pendingSeekAbsoluteTimeRef.current = null;
        lastSeekTargetDisplayTimeRef.current = displayTime;
      }
    } catch (err) {
      console.error('[Audio] canplay handler failed:', err);
    }
  };
  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const err = e.currentTarget.error;
    if (err) console.error(`Audio Error: Code ${err.code} - ${err.message}`);
  };

  // 处理音频结束，实现无尽播放
  const handleAudioEnded = useCallback(() => {
    console.log('[App] Audio ended, restarting for infinite playback, restart count:', audioRestartCount);

    const audio = audioRef.current;
    if (!audio) return;

    // 修复：设置音频结束标记，防止 timeUpdate 重复检测循环
    isAudioEndedRef.current = true;

    // 修复：先增加循环计数，然后立即同步状态，避免 timeUpdate 重复检测
    loopCountRef.current++;
    setAudioRestartCount(prev => prev + 1);

    // 立即同步时间状态，避免 timeUpdate 误判为循环
    setCurrentTime(0);
    setScrollTime(loopCountRef.current * duration);

    // 移动端特殊处理：防止内存泄漏和播放问题
    if (isMobile) {
      // 移动端：每10次重启后重新加载音频，防止内存问题
      if (audioRestartCount > 0 && audioRestartCount % 10 === 0) {
        console.log('[App] Mobile: reloading audio to prevent memory issues');
        audio.load();
        setTimeout(() => {
          audio.play().catch(err => console.error('[Audio] Mobile reload and play failed:', err));
        }, 200);
      } else {
        // 正常重启
        audio.currentTime = 0;  // 只重置音频元素时间
        audio.play()
          .then(() => {
            console.log('[App] Mobile audio restarted successfully');
          })
          .catch(e => {
            console.error('[Audio] Mobile audio restart failed:', e);
            // 移动端播放失败时，尝试重新加载
            audio.load();
            setTimeout(() => {
              audio.play().catch(err => console.error('[Audio] Mobile fallback play failed:', err));
            }, 100);
          });
      }
    } else {
      // 桌面端：正常重启
      audio.currentTime = 0;  // 只重置音频元素时间
      audio.play()
        .then(() => {
          console.log('[App] Desktop audio restarted successfully');
        })
        .catch(e => {
          console.error('[Audio] Desktop audio restart failed:', e);
        });
    }
  }, [isMobile, audioRestartCount]);

  // 移动端页面可见性检测，处理后台播放问题
  useEffect(() => {
    if (!isMobile) return;

    const handleVisibilityChange = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (document.hidden) {
        console.log('[App] Mobile: page hidden, pausing audio');
        audio.pause();
      } else {
        console.log('[App] Mobile: page visible, resuming audio');
        if (isPlaying) {
          audio.play().catch(e => {
            console.error('[Audio] Mobile resume failed:', e);
            // 如果恢复播放失败，可能需要用户重新交互
            setHasUserInteracted(false);
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMobile, isPlaying]);
  
  const currentLineIndex = findCurrentLineIndex(lyrics, currentTime, duration);

  const findAnchorChar = (currentIndex: number): string => {
    if (!lyrics || lyrics.length === 0) return '心';
    // Find the last non-blank line at or before the current index
    for (let i = currentIndex; i >= 0; i--) {
      const text = lyrics[i].text.trim();
      if (text) return text.charAt(0);
    }
    // If no non-blank line found before, find the first non-blank one in the whole song
    for (let i = 0; i < lyrics.length; i++) {
      const text = lyrics[i].text.trim();
      if (text) return text.charAt(0);
    }
    return '心'; // Fallback
  };
  const anchorChar = findAnchorChar(currentLineIndex);

  console.log('[App] Render state:', { hasUserInteracted, isReady, isPlaying, isIntroPlaying });
  
  return (
    <div className={`flex flex-col h-screen bg-[#202734] font-sans overflow-hidden ${!hasUserInteracted ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
        {/* 主音频 */}
        <audio
            key={audioSrc} ref={audioRef} src={audioSrc || undefined}
            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            onEnded={handleAudioEnded} onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata} onCanPlay={handleCanPlay} onError={handleAudioError}
            preload="auto"
            playsInline
            webkit-playsinline="true"
            controls={false}
        />
        
        {/* 引入音频 - 已移除，使用合并音频 */}
        
        {/* 自动播放引导 - 优先显示，避免页面内容闪现 */}
        <AutoPlayGuard 
            onUserInteraction={handleUserInteraction}
            isReady={isReady}
            isPlaying={isPlaying || isIntroPlaying}
        />
        
        {/* 移动端调试信息 - 生产环境也显示 */}
        {(
          <div className="fixed top-4 left-4 bg-black bg-opacity-90 text-white text-xs p-3 rounded z-50 max-w-xs">
            <div className="font-bold mb-2">调试信息</div>
            <div>设备: {isMobile ? '移动端' : '桌面端'}</div>
            <div>用户: {hasUserInteracted ? '已交互' : '未交互'}</div>
            <div>音频: {isReady ? '就绪' : '未就绪'}</div>
            <div>播放: {isPlaying ? '播放中' : '暂停'}</div>
            <div>引入: {isIntroPlaying ? '播放中' : '未播放'}</div>
            <div>重启: {audioRestartCount}次</div>
            <div className="text-xs text-gray-300 mt-1">文件: {audioSrc.split('/').pop()}</div>
            <button 
              onClick={() => {
                addDebugLog('手动测试播放');
                const audio = audioRef.current;
                if (audio) {
                  audio.play().catch(e => {
                    addDebugLog(`播放失败: ${e.message}`);
                    console.error('[Debug] Manual play failed:', e);
                  });
                }
              }}
              className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded"
            >
              测试播放
            </button>
            {debugLogs.length > 0 && (
              <div className="mt-2 text-xs text-gray-300">
                <div className="font-bold">最近日志:</div>
                {debugLogs.map((log, index) => (
                  <div key={index} className="truncate">{log}</div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="fixed inset-0 grid place-items-center pointer-events-none z-0">
            <span
                key={anchorChar + currentLineIndex}
                className="text-[#34455C] font-serif font-bold animate-fade-in"
                style={{ fontSize: '25rem', lineHeight: 1 }}
            >
                {anchorChar}
            </span>
        </div>

        <main className="relative w-full flex-grow flex justify-center items-center z-10 py-4 overflow-hidden">
            <div className="relative w-full max-w-4xl h-full pointer-events-auto">
                <LyricsScroller
                    lyrics={lyrics}
                    scrollTime={scrollTime}
                    displayTime={currentTime}
                    duration={duration}
                    onSeek={handleSeek}
                    isPlaying={isPlaying}
                />
                <div aria-hidden="true" className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-[#202734] to-transparent z-10 pointer-events-none" />
                <div aria-hidden="true" className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#202734] to-transparent z-10 pointer-events-none" />
            </div>
        </main>

        <footer className="w-full flex justify-center py-8 z-20">
            <AudioPlayer
                isPlaying={isPlaying} isReady={isReady}
                duration={duration} currentTime={currentTime}
                onPlayPause={handlePlayPause} onSeek={(time) => handleSeek(loopCountRef.current * duration + time)}
            />
        </footer>
    </div>
  );
};

export default App;