import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Song, LyricsData, TabType, RepeatMode, GlassSettings } from '../types/music';
import { MusicApi } from '../services/api';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface MusicContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Song[];
  queueIndex: number;
  favorites: Song[];
  history: Song[];
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activeTab: TabType;
  isPlayerExpanded: boolean;
  lyrics: LyricsData | null;
  activeLyricIndex: number;
  glassSettings: GlassSettings;
  playSong: (song: Song, newQueue?: Song[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  nextSong: () => void;
  prevSong: () => void;
  toggleFavorite: (song: Song) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  clearHistory: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setActiveTab: (tab: TabType) => void;
  setIsPlayerExpanded: (open: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  updateGlassSettings: (settings: Partial<GlassSettings>) => void;
}

const DEFAULT_GLASS_SETTINGS: GlassSettings = {
  blurIntensity: 28,
  refractionStrength: 18,
  meshSpeed: 1.0,
  dynamicMesh: true,
  hapticFeedback: true,
  audioQuality: 'high',
  blurEnabled: true,
  dynamicTheme: true,
  dynamicIcon: true,
  highRefresh: true,
  landscape: false,
};

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Persistence states
  const [favorites, setFavorites] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('liquid_music_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('liquid_music_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [glassSettings, setGlassSettings] = useState<GlassSettings>(() => {
    try {
      const saved = localStorage.getItem('liquid_glass_settings');
      return saved ? { ...DEFAULT_GLASS_SETTINGS, ...JSON.parse(saved) } : DEFAULT_GLASS_SETTINGS;
    } catch {
      return DEFAULT_GLASS_SETTINGS;
    }
  });

  // Player states
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState<boolean>(false);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimeoutRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const isUsingYTRef = useRef<boolean>(true);
  const pendingVideoIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Initialize YouTube IFrame Player
  useEffect(() => {
    const initYT = () => {
      if (window.YT && window.YT.Player && !ytPlayerRef.current) {
        try {
          ytPlayerRef.current = new window.YT.Player('yt-audio-player', {
            height: '200',
            width: '200',
            ...(currentSong?.videoId ? { videoId: currentSong.videoId } : {}),
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              rel: 0,
              playsinline: 1,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                ytReadyRef.current = true;
                if (pendingVideoIdRef.current) {
                  ytPlayerRef.current.loadVideoById(pendingVideoIdRef.current);
                  ytPlayerRef.current.playVideo();
                  pendingVideoIdRef.current = null;
                }
              },
              onStateChange: (event: any) => {
                // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
                if (event.data === 1) {
                  setIsPlaying(true);
                  const dur = ytPlayerRef.current?.getDuration?.();
                  if (dur && !isNaN(dur) && dur > 0) setDuration(dur);
                } else if (event.data === 2) {
                  setIsPlaying(false);
                } else if (event.data === 0) {
                  handleTrackEnd();
                }
              },
            },
          });
        } catch (e) {
          console.warn('YT player initialization notice:', e);
        }
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      window.onYouTubeIframeAPIReady = initYT;
    }

    // Interval time tracker for YouTube player
    const tracker = setInterval(() => {
      if (isUsingYTRef.current && ytPlayerRef.current && ytReadyRef.current) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime?.();
          const dur = ytPlayerRef.current.getDuration?.();
          if (typeof cur === 'number' && !isNaN(cur)) {
            setCurrentTime(cur);
          }
          if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
            setDuration(dur);
          }
        } catch {}
      }
    }, 100);

    return () => {
      clearInterval(tracker);
    };
  }, []);

  // Initialize standard HTML5 Audio Element as dual fallback
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;
    audio.volume = volume;

    const onTimeUpdate = () => {
      if (!isUsingYTRef.current) setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (!isUsingYTRef.current && audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => {
      if (!isUsingYTRef.current) setIsPlaying(true);
    };
    const onPause = () => {
      if (!isUsingYTRef.current) setIsPlaying(false);
    };
    const onEnded = () => {
      if (!isUsingYTRef.current) handleTrackEnd();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  // Sync favorites & history to localStorage
  useEffect(() => {
    localStorage.setItem('liquid_music_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('liquid_music_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('liquid_glass_settings', JSON.stringify(glassSettings));
  }, [glassSettings]);

  // Sync lyrics when currentSong changes (lirik asli; abaikan respons usang)
  useEffect(() => {
    const vid = currentSong?.videoId || currentSong?.id;
    if (!vid) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyrics(null);
    MusicApi.getLyrics(vid).then((lyricData) => {
      if (!cancelled) setLyrics(lyricData);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  // Calculate active lyric index according to currentTime
  useEffect(() => {
    if (!lyrics || !lyrics.syncedLyrics || lyrics.syncedLyrics.length === 0) {
      setActiveLyricIndex(-1);
      return;
    }
    const lines = lyrics.syncedLyrics;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    setActiveLyricIndex(idx);
  }, [currentTime, lyrics]);

  // Update Media Session API for lockscreen and peripheral controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artists.map((a) => a.name).join(', '),
        album: currentSong.album?.name || 'Liquid Glass Music',
        artwork: [
          { src: currentSong.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: currentSong.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: currentSong.thumbnail, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevSong());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextSong());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
    }
  }, [currentSong]);

  const playSong = useCallback(
    (song: Song, newQueue?: Song[]) => {
      const activeList = newQueue || queue;
      const indexInList = activeList.findIndex((s) => s.id === song.id);

      if (newQueue) {
        setQueue(newQueue);
        setQueueIndex(indexInList !== -1 ? indexInList : 0);
      } else if (indexInList !== -1) {
        setQueueIndex(indexInList);
      } else {
        setQueue((prev) => [...prev, song]);
        setQueueIndex(activeList.length);
      }

      setCurrentSong(song);
      setCurrentTime(0);

      const targetVideoId = song.videoId || (song.id && !song.id.startsWith('vid_') ? song.id : null);

      if (targetVideoId) {
        // Play exact YouTube Music track via YouTube audio engine
        isUsingYTRef.current = true;
        if (audioRef.current) audioRef.current.pause();

        if (ytPlayerRef.current && ytReadyRef.current && ytPlayerRef.current.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById(targetVideoId);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
          } catch (e) {
            console.warn('Error playing video via YT API:', e);
          }
        } else {
          pendingVideoIdRef.current = targetVideoId;
        }
      } else {
        // Play via HTML5 Audio element
        isUsingYTRef.current = false;
        if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();

        const audio = audioRef.current;
        if (audio) {
          audio.src = song.streamUrl || MusicApi.getStreamUrl(song.id);
          audio.load();
          audio.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }

      // Add to playback history
      setHistory((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [song, ...filtered].slice(0, 50);
      });
    },
    [queue]
  );

  const togglePlay = useCallback(() => {
    if (isUsingYTRef.current && ytPlayerRef.current?.getPlayerState) {
      try {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) {
          ytPlayerRef.current.pauseVideo();
          setIsPlaying(false);
        } else {
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }
        return;
      } catch {}
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const pause = useCallback(() => {
    if (isUsingYTRef.current && ytPlayerRef.current?.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    if (isUsingYTRef.current && ytPlayerRef.current?.playVideo) {
      try {
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
        return;
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    if (isUsingYTRef.current && ytPlayerRef.current?.seekTo) {
      try {
        ytPlayerRef.current.seekTo(seconds, true);
        setCurrentTime(seconds);
        return;
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, []);

  const nextSong = useCallback(() => {
    if (queue.length === 0) return;

    let nextIdx: number;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeatMode === 'off') {
          pause();
          return;
        }
        nextIdx = 0;
      }
    }
    setQueueIndex(nextIdx);
    const nextTrack = queue[nextIdx];
    if (nextTrack) {
      playSong(nextTrack);
    }
  }, [queue, queueIndex, isShuffle, repeatMode, playSong, pause]);

  const prevSong = useCallback(() => {
    if (queue.length === 0) return;

    if (currentTime > 3) {
      seek(0);
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }
    setQueueIndex(prevIdx);
    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      playSong(prevTrack);
    }
  }, [queue, queueIndex, currentTime, seek, playSong]);

  const handleTrackEnd = useCallback(() => {
    if (repeatMode === 'one') {
      seek(0);
      resume();
    } else {
      nextSong();
    }
  }, [repeatMode, nextSong, seek, resume]);

  const toggleFavorite = useCallback((song: Song) => {
    setFavorites((prev) => {
      const exists = prev.some((s) => s.id === song.id);
      if (exists) {
        showToast('Dihapus dari Favorit');
        return prev.filter((s) => s.id !== song.id);
      } else {
        showToast('Ditambahkan ke Favorit ❤️');
        return [song, ...prev];
      }
    });
  }, [showToast]);

  const isFavorite = useCallback(
    (songId: string) => {
      return favorites.some((s) => s.id === songId);
    },
    [favorites]
  );

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => [...prev, song]);
    showToast('Ditambahkan ke Antrean');
  }, [showToast]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    if (currentSong) {
      setQueue([currentSong]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  }, [currentSong]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);

    if (ytPlayerRef.current?.setVolume) {
      try {
        ytPlayerRef.current.setVolume(Math.round(clamped * 100));
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      if (ytPlayerRef.current?.unMute) ytPlayerRef.current.unMute();
      if (audioRef.current) audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      if (ytPlayerRef.current?.mute) ytPlayerRef.current.mute();
      if (audioRef.current) audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const updateGlassSettings = useCallback((newSettings: Partial<GlassSettings>) => {
    setGlassSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  return (
    <MusicContext.Provider
      value={{
        currentSong,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        queue,
        queueIndex,
        favorites,
        history,
        repeatMode,
        isShuffle,
        activeTab,
        isPlayerExpanded,
        lyrics,
        activeLyricIndex,
        glassSettings,
        playSong,
        togglePlay,
        pause,
        resume,
        seek,
        nextSong,
        prevSong,
        toggleFavorite,
        isFavorite,
        addToQueue,
        removeFromQueue,
        clearQueue,
        clearHistory,
        setVolume,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        setActiveTab,
        setIsPlayerExpanded,
        toastMessage,
        showToast,
        updateGlassSettings,
      }}
    >
      {/* Hidden container for YouTube audio player */}
      <div
        id="yt-audio-player"
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 200,
          height: 200,
          opacity: 0.001,
          pointerEvents: 'none',
          zIndex: -999,
        }}
      />
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
