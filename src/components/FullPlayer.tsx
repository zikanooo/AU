import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'motion/react';
import {
  ChevronDown, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, Play, Pause,
  MoreVertical, MicVocal, ListMusic, Share2, Moon, Trash2, Music2, ExternalLink, Link2,
} from 'lucide-react';
import { useMusic } from '../context/MusicContext';

type View = 'cover' | 'lyrics' | 'queue';
const SLEEP_STEPS = [0, 15, 30, 60];

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
};

export const FullPlayer: React.FC = () => {
  const {
    currentSong, isPlaying, currentTime, duration, queue, queueIndex, repeatMode, isShuffle,
    lyrics, activeLyricIndex, isPlayerExpanded, togglePlay, pause, seek, nextSong, prevSong,
    toggleFavorite, isFavorite, toggleRepeat, toggleShuffle, playSong, removeFromQueue,
    clearQueue, setIsPlayerExpanded, showToast,
  } = useMusic();

  const [view, setView] = useState<View>('cover');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sleepMin, setSleepMin] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  const dragControls = useDragControls();

  const lyricsRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollUntil = useRef(0);

  const lines = lyrics?.syncedLyrics ?? [];
  const lyricsSource = lyrics?.source;
  const hasSynced = lines.length > 0;

  // Sleep timer
  useEffect(() => {
    if (!sleepMin) return;
    const t = setTimeout(() => {
      pause();
      setSleepMin(0);
      showToast('Waktu tidur: musik dihentikan');
    }, sleepMin * 60 * 1000);
    return () => clearTimeout(t);
  }, [sleepMin, pause, showToast]);

  // Reset view per lagu baru? tetap di view yang sama; tutup menu saat pemutar ditutup
  useEffect(() => { if (!isPlayerExpanded) setMenuOpen(false); }, [isPlayerExpanded]);

  // Smooth centered auto-scroll
  useEffect(() => {
    if (view !== 'lyrics' || !hasSynced) return;
    const c = lyricsRef.current;
    const el = lineRefs.current[Math.max(activeLyricIndex, 0)];
    if (!c || !el || Date.now() < userScrollUntil.current) return;
    c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight * 0.36 + el.clientHeight / 2), behavior: 'smooth' });
  }, [activeLyricIndex, view, hasSynced]);

  useEffect(() => {
    if (view !== 'lyrics') return;
    userScrollUntil.current = 0;
    const t = setTimeout(() => {
      const c = lyricsRef.current;
      const el = lineRefs.current[Math.max(activeLyricIndex, 0)];
      if (c && el) c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight * 0.36), behavior: 'auto' });
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentSong?.id, lyrics]);

  const activeFill = useMemo(() => {
    if (!hasSynced || activeLyricIndex < 0) return 0;
    const cur = lines[activeLyricIndex];
    const next = lines[activeLyricIndex + 1];
    const end = next ? next.time : cur.time + 4;
    const span = Math.max(0.4, Math.min(end - cur.time, 8));
    return Math.max(0, Math.min(100, ((currentTime - cur.time) / span) * 130));
  }, [currentTime, activeLyricIndex, lines, hasSynced]);

  if (!currentSong) return null;

    const sec = isSeeking ? seekVal : currentTime;
  const progress = duration > 0 ? (sec / duration) * 100 : 0;
  const fav = isFavorite(currentSong.id);
  const artistNames = currentSong.artists.map((a) => a.name).join(', ');
  const ytLink = `https://music.youtube.com/watch?v=${currentSong.videoId || currentSong.id}`;

  const endSeek = () => { seek(seekVal); setIsSeeking(false); };
  const onDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) setIsPlayerExpanded(false);
  };

  const share = async () => {
    const data = { title: currentSong.title, text: `${currentSong.title} – ${artistNames}`, url: ytLink };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(ytLink); showToast('Tautan disalin'); }
    } catch {}
  };
  const cycleSleep = () => {
    const next = SLEEP_STEPS[(SLEEP_STEPS.indexOf(sleepMin) + 1) % SLEEP_STEPS.length];
    setSleepMin(next);
    showToast(next ? `Waktu tidur ${next} menit` : 'Waktu tidur mati');
  };
  const toggleView = (v: View) => setView((cur) => (cur === v ? 'cover' : v));

  const bottomBtn = (id: string, label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button key={id} onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
      <span className={`w-[46px] h-[46px] rounded-full flex items-center justify-center border transition-colors ${
        active ? 'bg-accent text-ink border-accent' : 'bg-white/[0.06] text-accent border-accent/60'
      }`}>{icon}</span>
      <span className="text-[11px] text-[#d6cdcf]">{label}</span>
    </button>
  );

  return (
    <AnimatePresence>
      {isPlayerExpanded && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 300 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.02, bottom: 0.6 }}
          onDragEnd={onDragEnd}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0d0b0c] text-[#f4eceb]"
        >
          {/* Backdrop: dark mauve with soft cover tint */}
          <div className="absolute inset-0 pointer-events-none">
            <img src={currentSong.thumbnail} alt="" aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover scale-150 blur-[100px] opacity-40 saturate-150" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 transition-colors duration-1000" style={{ background: `radial-gradient(120% 70% at 50% 0%, var(--tint-glow) 0%, transparent 72%)` }} />
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--tint)]/60 via-[#0d0b0c]/85 to-[#0d0b0c]" />
          </div>

          {/* Header */}
          <div className="relative z-10 px-5 pt-3 pb-2 shrink-0 touch-none" onPointerDown={(e) => dragControls.start(e)}>
            <div className="mx-auto w-10 h-1 bg-white/30 rounded-full mb-3" />
            <div className="flex items-center gap-3">
              <button onClick={() => setIsPlayerExpanded(false)} onPointerDown={(e) => e.stopPropagation()}
                className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#f0e6e5] active:scale-90" aria-label="Tutup">
                <ChevronDown size={26} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold tracking-[0.12em] text-muted uppercase">Memutar dari</p>
                <p className="text-[16px] font-bold truncate leading-tight">Mix {currentSong.title}</p>
              </div>
            </div>
          </div>

          {/* Center */}
          <div className="relative z-10 flex-1 min-h-0 w-full max-w-lg mx-auto px-5">
            <AnimatePresence mode="wait" initial={false}>
              {view === 'cover' && (
                <motion.div key="cover" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="h-full flex flex-col items-center justify-center">
                  <div className="relative w-full flex justify-center pb-7" style={{ perspective: 900 }}>
                    <motion.div animate={{ scale: isPlaying ? 1 : 0.88 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                      className="relative w-[84vw] max-w-[360px] aspect-square">
                      <div className={`float-art w-full h-full ${isPlaying ? '' : 'paused'}`}>
                        <div className="absolute -inset-3 rounded-[44px] blur-2xl opacity-35 transition-colors duration-1000" style={{ backgroundColor: 'var(--accent)' }} />
                        <div className="relative w-full h-full rounded-[34px] overflow-hidden bg-white/10 border border-white/12 shadow-[0_30px_60px_-18px_rgba(0,0,0,0.85)] flex items-center justify-center">
                          <img src={currentSong.thumbnail} alt={currentSong.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" draggable={false} />
                        </div>
                      </div>
                      <div className={`float-shadow ${isPlaying ? '' : 'paused'} absolute -bottom-6 left-1/2 w-[68%] h-5 rounded-[50%] bg-black/70 blur-xl`} />
                    </motion.div>
                  </div>

                  <div className="w-full flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[26px] font-bold tracking-tight truncate leading-tight">{currentSong.title}</h2>
                      <p className="text-[17px] font-semibold text-accent truncate">{artistNames}</p>
                    </div>
                    <button onClick={() => toggleFavorite(currentSong)} className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/12 flex items-center justify-center active:scale-90 transition-transform" aria-label="Favorit">
                      <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
                        <Heart size={22} className={fav ? 'text-accent fill-accent' : 'text-[#f0e6e5]'} />
                      </motion.span>
                    </button>
                    <div className="relative">
                      <button onClick={() => setMenuOpen((o) => !o)} className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/12 flex items-center justify-center active:scale-90 transition-transform" aria-label="Menu">
                        <MoreVertical size={22} className="text-[#f0e6e5]" />
                      </button>
                      <AnimatePresence>
                        {menuOpen && (
                          <motion.div initial={{ opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute right-0 bottom-14 w-56 rounded-2xl glass-pill p-1.5 z-20 origin-bottom-right">
                            <a href={ytLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] active:bg-white/10">
                              <ExternalLink size={17} /> Buka di YouTube Music
                            </a>
                            <button onClick={async () => { try { await navigator.clipboard.writeText(ytLink); showToast('Tautan disalin'); } catch {} setMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] active:bg-white/10">
                              <Link2 size={17} /> Salin tautan
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {view === 'lyrics' && (
                <motion.div key="lyrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="h-full flex flex-col">
                  <div className="flex items-center gap-3 pb-2 shrink-0">
                    <img src={currentSong.thumbnail} alt="" className="w-11 h-11 rounded-xl object-cover shadow-lg" referrerPolicy="no-referrer" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold truncate">{currentSong.title}</p>
                      <p className="text-[12px] text-accent truncate">{artistNames}</p>
                    </div>
                  </div>
                  {lyricsSource && <p className="text-[11px] text-muted pb-1 shrink-0">Lirik dari {lyricsSource}</p>}
                  <div ref={lyricsRef}
                    onWheel={() => (userScrollUntil.current = Date.now() + 3000)}
                    onTouchMove={() => (userScrollUntil.current = Date.now() + 3000)}
                    className="relative flex-1 overflow-y-auto no-scrollbar lyrics-mask -mx-5 px-5">
                    {hasSynced ? (
                      <div className="pt-[14vh] pb-[34vh]">
                        {lines.map((line, idx) => {
                          const active = idx === activeLyricIndex;
                          const dist = activeLyricIndex < 0 ? idx + 1 : Math.abs(idx - activeLyricIndex);
                          const blur = active ? 0 : Math.min(dist * 0.9, 3.5);
                          const opacity = active ? 1 : Math.max(0.22, 0.62 - dist * 0.12);
                          const gap = !line.text || !line.text.trim();
                          return (
                            <div key={idx} ref={(el) => { lineRefs.current[idx] = el; }}
                              onClick={() => { userScrollUntil.current = 0; seek(line.time); }}
                              className="lyric-line cursor-pointer py-[8px] origin-center text-center"
                              style={{ transform: active ? 'scale(1)' : 'scale(0.86)', opacity, filter: blur ? `blur(${blur}px)` : 'none' }}>
                              {gap ? (
                                <div className="flex gap-2 h-8 items-center justify-center">
                                  {[0, 1, 2].map((d) => (
                                    <motion.span key={d}
                                      animate={active ? { scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] } : { scale: 1, opacity: 0.4 }}
                                      transition={{ duration: 1.4, repeat: Infinity, delay: d * 0.22 }}
                                      className="w-2.5 h-2.5 rounded-full bg-white" />
                                  ))}
                                </div>
                              ) : active ? (
                                <p className="lyric-fill text-[30px] leading-[1.2] font-extrabold tracking-tight" style={{ ['--fill' as any]: `${activeFill}%` }}>{line.text}</p>
                              ) : (
                                <p className="text-[30px] leading-[1.2] font-extrabold tracking-tight text-white">{line.text}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : lyrics?.plainLyrics ? (
                      <p className="py-6 text-[19px] font-semibold leading-relaxed text-white/80 whitespace-pre-line">{lyrics.plainLyrics}</p>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted gap-3">
                        <Music2 size={32} className={lyrics ? '' : 'animate-pulse'} />
                        <p className="text-sm">{lyrics ? 'Lirik tidak tersedia untuk lagu ini' : 'Memuat lirik...'}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {view === 'queue' && (
                <motion.div key="queue" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="h-full flex flex-col">
                  <div className="flex items-center justify-between pb-2 shrink-0">
                    <span className="text-[17px] font-bold">Antrean · {queue.length}</span>
                    <button onClick={clearQueue} className="text-[12.5px] text-rose-300 flex items-center gap-1"><Trash2 size={13} /> Bersihkan</button>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar pb-3">
                    {queue.map((song, idx) => {
                      const cur = idx === queueIndex;
                      return (
                        <div key={`${song.id}-${idx}`} onClick={() => playSong(song)}
                          className={`flex items-center gap-3 p-2 rounded-2xl cursor-pointer ${cur ? 'bg-white/10' : ''}`}>
                          <img src={song.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover bg-white/10" referrerPolicy="no-referrer" />
                          <div className="min-w-0 flex-1">
                            <p className={`text-[14.5px] font-semibold truncate ${cur ? 'text-accent' : ''}`}>{song.title}</p>
                            <p className="text-[12.5px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }} className="p-2 text-muted active:scale-90" aria-label="Hapus"><Trash2 size={16} /></button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="relative z-10 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] w-full max-w-lg mx-auto shrink-0">
            <div className="mb-3">
              <input type="range" min="0" max={duration || 100} step="0.1" value={sec}
                onChange={(e) => setSeekVal(parseFloat(e.target.value))}
                onMouseDown={() => { setIsSeeking(true); setSeekVal(currentTime); }} onMouseUp={endSeek}
                onTouchStart={() => { setIsSeeking(true); setSeekVal(currentTime); }} onTouchEnd={endSeek}
                className="seek w-full cursor-pointer" aria-label="Posisi lagu"
                style={{ background: `linear-gradient(to right, var(--accent) ${progress}%, rgba(255,255,255,0.22) ${progress}%)` }} />
              <div className="flex justify-between text-[12px] tabular-nums text-muted mt-2 font-medium">
                <span>{formatTime(sec)}</span><span>-{formatTime(Math.max(0, duration - sec))}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mb-5 px-1">
              <button onClick={toggleShuffle} className={`p-2.5 ${isShuffle ? 'text-accent' : 'text-[#c9bfc2]'}`} aria-label="Acak"><Shuffle size={24} /></button>
              <button onClick={prevSong} className="p-2 text-white active:scale-90 transition-transform" aria-label="Sebelumnya"><SkipBack size={32} className="fill-current" /></button>
              <button onClick={togglePlay} className="p-1 text-white active:scale-90 transition-transform" aria-label={isPlaying ? 'Jeda' : 'Putar'}>
                {isPlaying ? <Pause size={64} className="fill-current" /> : <Play size={64} className="fill-current" />}
              </button>
              <button onClick={nextSong} className="p-2 text-white active:scale-90 transition-transform" aria-label="Berikutnya"><SkipForward size={32} className="fill-current" /></button>
              <button onClick={toggleRepeat} className={`p-2.5 ${repeatMode !== 'off' ? 'text-accent' : 'text-[#c9bfc2]'}`} aria-label="Ulangi">
                {repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}
              </button>
            </div>

            <div className="flex items-start justify-between px-2">
              {bottomBtn('lyrics', 'Lirik', <MicVocal size={22} />, () => toggleView('lyrics'), view === 'lyrics')}
              {bottomBtn('queue', 'Antrean', <ListMusic size={22} />, () => toggleView('queue'), view === 'queue')}
              {bottomBtn('share', 'Bagikan', <Share2 size={21} />, share)}
              {bottomBtn('sleep', sleepMin ? `${sleepMin} mnt` : 'Waktu tidur', <Moon size={21} />, cycleSleep, sleepMin > 0)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
