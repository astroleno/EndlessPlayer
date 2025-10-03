import React from 'react';

interface AudioPlayerProps {
  isPlaying: boolean;
  isReady: boolean;
  duration: number;
  currentTime: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

const formatTime = (timeInSeconds: number): string => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ isPlaying, isReady, duration, currentTime, onPlayPause, onSeek }) => {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    onSeek(time);
  };
  
  const PlayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
    </svg>
  );

  const PauseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Zm9 0a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
    </svg>
  );


  return (
    <div className="w-full max-w-2xl p-4 bg-[#2A3447] rounded-xl shadow-lg">
      <div className="flex items-center gap-4">
        <button 
          onClick={onPlayPause}
          disabled={!isReady}
          className="text-[#87CEEB] hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="flex-grow flex items-center gap-3">
            <span className="text-sm font-mono text-gray-400 w-12 text-center">{formatTime(currentTime)}</span>
            <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isReady}
                className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-lg disabled:cursor-not-allowed"
                style={{
                    background: `linear-gradient(to right, #87CEEB ${progress}%, #4A5568 ${progress}%)`
                }}
            />
            <span className="text-sm font-mono text-gray-400 w-12 text-center">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;