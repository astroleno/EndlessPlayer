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
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const introAudioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loopCountRef = useRef(0);
  // 当音频尚未就绪时，缓存一次待应用的绝对跳转时间（单位：秒）
  const pendingSeekAbsoluteTimeRef = useRef<number | null>(null);
  // 记录最近一次期望跳转到的显示时间（用于抑制 timeupdate 抢写）
  const lastSeekTargetDisplayTimeRef = useRef<number | null>(null);

  const lyrics = useLyrics(LRC_LYRICS);

  useEffect(() => {
    // 接入真实音频：位于 public/audio/ 目录下，构建后可通过 /audio/ 路径直接访问
    try {
      const realAudioPath = '/audio/心经.mp3';
      console.log('[App] Setting audio source:', realAudioPath);
      setAudioSrc(realAudioPath);
      // 初始状态保持同步：都从0开始，避免scrollTime和currentTime错位
      setScrollTime(0);
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      // 其余真实时长会在 onLoadedMetadata 中更新
      // 这里无需手动清理 URL 对象
    } catch (error) {
      console.error('[Audio] Failed to set real audio source:', error);
    }
  }, []);

  const handleUserInteraction = useCallback(() => {
    console.log('[App] User interaction triggered');
    setHasUserInteracted(true);
    setIsIntroPlaying(true);

    // 重置滚动状态，确保初始同步
    setScrollTime(0);
    setCurrentTime(0);
    loopCountRef.current = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;

    // iOS不支持同时播放多个音频，改为先后播放
    const introAudio = introAudioRef.current;
    const mainAudio = audioRef.current;

    if (introAudio) {
      console.log('[App] Starting intro audio');
      introAudio.play()
        .then(() => {
          console.log('[App] Intro audio started successfully');
        })
        .catch(e => {
          console.error('[Audio] Intro playback failed:', e);
          // 如果引入音频失败，直接开始主音频
          if (mainAudio && isReady) {
            console.log('[App] Starting main audio after intro failure');
            mainAudio.play().catch(e => console.error('[Audio] Main audio playback failed:', e));
          }
        });
    } else if (mainAudio && isReady) {
      // 如果没有引入音频，直接播放主音频
      console.log('[App] Starting main audio directly');
      mainAudio.play().catch(e => console.error('[Audio] Main audio playback failed:', e));
    }
  }, [isReady]);

  const handleIntroEnd = useCallback(() => {
    console.log('[App] Intro audio ended, starting main audio');
    setIsIntroPlaying(false);
    
    // 引入音频结束后，开始播放主音频
    const mainAudio = audioRef.current;
    if (mainAudio && isReady) {
      console.log('[App] Starting main audio after intro');
      mainAudio.play()
        .then(() => {
          console.log('[App] Main audio started successfully');
        })
        .catch(e => {
          console.error('[Audio] Main audio playback failed after intro:', e);
        });
    }
  }, [isReady]);

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

    // 正常情况下更新时间
    // 检测循环重置（从接近结尾跳到开头）
    if (newDisplayTime < currentTime && Math.abs(newDisplayTime - currentTime) > duration / 2) {
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
            key={audioSrc} ref={audioRef} src={audioSrc}
            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            onEnded={() => { loopCountRef.current++; }} onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata} onCanPlay={handleCanPlay} onError={handleAudioError}
            preload="auto" loop
            playsInline
            webkit-playsinline="true"
            controls={false}
        />
        
        {/* 引入音频 */}
        <audio
            ref={introAudioRef} src="/audio/tone_singing_bowl.mp3"
            onEnded={handleIntroEnd} onError={handleIntroEnd}
            preload="auto"
            playsInline
            webkit-playsinline="true"
            controls={false}
        />
        
        {/* 自动播放引导 - 优先显示，避免页面内容闪现 */}
        <AutoPlayGuard 
            onUserInteraction={handleUserInteraction}
            isReady={isReady}
            isPlaying={isPlaying || isIntroPlaying}
        />
        
        {/* 移动端调试信息 */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed top-4 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded z-50">
            <div>User: {hasUserInteracted ? 'Yes' : 'No'}</div>
            <div>Ready: {isReady ? 'Yes' : 'No'}</div>
            <div>Playing: {isPlaying ? 'Yes' : 'No'}</div>
            <div>Intro: {isIntroPlaying ? 'Yes' : 'No'}</div>
            <div>Audio: {audioSrc}</div>
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