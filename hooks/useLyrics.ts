import { useMemo } from 'react';
import type { LyricLine } from '../types';

const useLyrics = (lrc: string): LyricLine[] => {
  return useMemo(() => {
    if (!lrc) return [];
    
    const lines = lrc.split('\n');
    const parsedLyrics: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
        const text = match[4].trim();
        const time = minutes * 60 + seconds + milliseconds / 1000;
        
        // Now includes lines with empty text to act as spacers
        parsedLyrics.push({ time, text });
      }
    }
    
    // Sort by time just in case the LRC file is not ordered
    return parsedLyrics.sort((a, b) => a.time - b.time);
  }, [lrc]);
};

export default useLyrics;