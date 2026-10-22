import React, { useState, useEffect, useRef } from 'react';
import {
  History, BarChart3, Settings, Users, ChevronRight, Play, MoreVertical, Mic, Shuffle,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { Song, Album, Artist } from '../types/music';
import { MusicApi } from '../services/api';
import { useMusic } from '../context/MusicContext';
import { SongCardSkeleton, AlbumCardSkeleton, ArtistCardSkeleton, SpeedDialSkeleton } from '../components/SkeletonLoader';

type Mood = { id: string; name: string; color: string };

const DEFAULT_MOODS: Mood[] = [
  { id: 'feelgood', name: 'Bersemangat', color: '#fbbf24' },
  { id: 'sad', name: 'Sedih', color: '#60a5fa' },
  { id: 'energi', name: 'Olah Raga', color: '#f97316' },
  { id: 'chill', name: 'Bersantai', color: '#10b981' },
  { id: 'romance', name: 'Romantis', color: '#f472b6' },
  { id: 'fokus', name: 'Fokus', color: '#a855f7' },
  { id: 'party', name: 'Pesta', color: '#ec4899' },
];

const DiceFive: React.FC = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    {[[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="5.2" fill="var(--accent)" opacity="0.92" />
    ))}
  </svg>
);

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const SectionHeader: React.FC<{ eyebrow?: string; title: string; onPlayAll?: () => void; onMore?: () => void }> = ({
  eyebrow, title, onPlayAll, onMore,
}) => (
  <div className="flex items-end justify-between mb-3.5">
    <div className="min-w-0">
      {eyebrow && <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</p>}
      <h2 className="text-[22px] font-bold text-[#f4eceb] tracking-tight leading-tight truncate">{title}</h2>
    </div>
    {onPlayAll && (
      <button onClick={onPlayAll} className="shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium text-[#f0e6e5] border border-white/20 bg-white/5 active:scale-95 transition-transform">
        Putar semua
      </button>
    )}
    {onMore && (
      <button onClick={onMore} className="shrink-0 p-1 text-[#e9dfde] active:scale-90" aria-label="Lihat semua">
        <ChevronRight size={22} />
      </button>
    )}
  </div>
);

export const HomePage: React.FC = () => {
  const { playSong, currentSong, isPlaying, addToQueue, showToast, setActiveTab } = useMusic();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeMood, setActiveMood] = useState<string>('semua');
  const [moods, setMoods] = useState<Mood[]>(DEFAULT_MOODS);
  const [quickPicks, setQuickPicks] = useState<Song[]>([]);
  const [charts, setCharts] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [dialPage, setDialPage] = useState(0);
  const lastRef = useRef(Date.now());

  // Data real-time: refresh tiap 5 menit & saat tab aktif kembali
  useEffect(() => {
    let alive = true;
    const load = (silent: boolean) => {
      if (!silent) setLoading(true);
      MusicApi.getHome(activeMood)
        .then((d) => {
          if (!alive) return;
          setQuickPicks(d.quickPicks);
          setCharts(d.charts);
          setAlbums(d.featuredAlbums);
          setArtists(d.trendingArtists);
          if (d.moods?.length) setMoods(d.moods.filter((m) => m.id !== 'semua' && m.id !== 'trending'));
          setUpdatedAt(d.updatedAt ? d.updatedAt * 1000 : Date.now());
          setError('');
          setLoading(false);
          lastRef.current = Date.now();
        })
        .catch((e: Error) => {
          if (!alive) return;
          if (!silent) setError(e.message || 'Gagal memuat YouTube Music');
          setLoading(false);
        });
    };
    load(false);
    const timer = setInterval(() => load(true), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRef.current > 2 * 60 * 1000) load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeMood, reloadKey]);

  const speedItems = quickPicks.slice(0, 17);
  const dialPages = chunk<Song | 'dice'>([...speedItems, 'dice'], 9);
  const recommended = quickPicks.slice(17).length ? quickPicks.slice(17) : charts.slice(0, 8);
  const chartColumns = chunk(charts.slice(0, 12), 4);
  const recColumns = chunk(recommended.slice(0, 8), 4);

  const playAll = (list: Song[]) => list.length && playSong(list[0], list);
  const randomPlay = () => {
    const pool = [...quickPicks, ...charts];
    if (!pool.length) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  };

  const playAlbum = async (album: Album) => {
    try {
      const full = album.tracks?.length ? album : await MusicApi.getAlbum(album.id);
      if (full.tracks?.length) playSong(full.tracks[0], full.tracks);
    } catch {
      showToast('Album gagal dimuat');
    }
  };
  const playArtist = async (artist: Artist) => {
    try {
      if (!artist.id) return;
      const { songs } = await MusicApi.getArtist(artist.id);
      if (songs.length) playSong(songs[0], songs);
    } catch {
      showToast('Artis gagal dimuat');
    }
  };
  const startVoice = () => {
    setActiveTab('search');
    setTimeout(() => window.dispatchEvent(new Event('voice-search')), 250);
  };

  const renderRow = (song: Song, list: Song[]) => {
    const current = currentSong?.id === song.id;
    return (
      <div
        key={song.id}
        onClick={() => playSong(song, list)}
        className={`flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-2xl cursor-pointer active:opacity-70 ${current ? 'bg-white/10' : ''}`}
      >
        <div className="relative w-[52px] h-[52px] rounded-[14px] overflow-hidden shrink-0 bg-white/10">
          <img src={song.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          {current && isPlaying && (
            <div className="absolute inset-0 bg-black/50 flex items-end justify-center gap-[3px] pb-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-[3px] bg-accent rounded-full animate-pulse" style={{ height: 8 + i * 4, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{song.title}</p>
          <p className="text-[13px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); addToQueue(song); showToast('Ditambahkan ke antrean'); }}
          className="p-2 text-[#e9dfde] active:scale-90"
          aria-label="Tambah ke antrean"
        >
          <MoreVertical size={20} />
        </button>
      </div>
    );
  };

  const renderColumns = (cols: Song[][], list: Song[]) => (
    <div className="flex gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4">
      {cols.map((col, i) => (
        <div key={i} className="snap-start shrink-0 w-[94%]">
          {col.map((s) => renderRow(s, list))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8 pb-52">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[#f4eceb]">Beranda</h1>
          {updatedAt > 0 && (
            <p className="text-[11px] text-muted -mt-0.5">
              Diperbarui {new Date(updatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-[#e9dfde]">
          <button onClick={() => setActiveTab('library')} className="p-2.5 active:scale-90" aria-label="Riwayat"><History size={22} /></button>
          <button onClick={() => setActiveTab('library')} className="p-2.5 active:scale-90" aria-label="Statistik"><BarChart3 size={22} /></button>
          <button onClick={() => setActiveTab('together')} className="p-2.5 active:scale-90" aria-label="Dengar bersama"><Users size={22} /></button>
          <button onClick={() => setActiveTab('profile')} className="p-2.5 active:scale-90" aria-label="Pengaturan"><Settings size={22} /></button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl glass-panel border-rose-300/30">
          <div className="flex items-center gap-2 text-[13px] text-rose-200 min-w-0">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button onClick={() => { setError(''); setReloadKey((k) => k + 1); }}
            className="shrink-0 px-3 py-1.5 rounded-full bg-accent text-ink text-xs font-bold flex items-center gap-1.5 active:scale-95">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      )}

      {/* Mood chips */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 -mt-2">
        {moods.map((m) => (
          <button key={m.id} onClick={() => setActiveMood(activeMood === m.id ? 'semua' : m.id)}
            className={`chip ${activeMood === m.id ? 'chip-active' : ''}`}>
            {m.name}
          </button>
        ))}
      </div>

      {/* Speed dial */}
      <section>
        <SectionHeader title={activeMood === 'semua' ? 'Panggilan cepat' : moods.find((m) => m.id === activeMood)?.name || 'Panggilan cepat'} />
        {loading ? (
          <SpeedDialSkeleton />
        ) : (
          <>
            <div
              className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4"
              onScroll={(e) => setDialPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            >
              {dialPages.map((page, pi) => (
                <div key={pi} className="snap-start shrink-0 w-full px-4 grid grid-cols-3 gap-x-3 gap-y-4 content-start">
                  {page.map((item, i) =>
                    item === 'dice' ? (
                      <button key="dice" onClick={randomPlay} className="aspect-square rounded-[20px] glass-panel flex items-center justify-center active:scale-95 transition-transform" aria-label="Putar acak">
                        <DiceFive />
                      </button>
                    ) : (
                      <button key={item.id} onClick={() => playSong(item, speedItems)} className="text-left active:scale-[0.97] transition-transform min-w-0">
                        <div className="relative aspect-square rounded-[20px] overflow-hidden bg-white/10 shadow-lg">
                          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                          {currentSong?.id === item.id && (
                            <div className="absolute inset-0 ring-2 ring-inset ring-accent rounded-[20px] bg-black/25" />
                          )}
                        </div>
                        <p className="mt-1.5 text-[13px] font-semibold text-[#f4eceb] truncate">{item.title}</p>
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
            {dialPages.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {dialPages.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === dialPage ? 'w-4 bg-accent' : 'w-1.5 bg-white/25'}`} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Top charts */}
      <section>
        <SectionHeader title="Pilihan cepat" onPlayAll={() => playAll(charts)} />
        {loading ? <div className="space-y-2">{[1, 2, 3].map((n) => <SongCardSkeleton key={n} />)}</div> : renderColumns(chartColumns, charts)}
      </section>

      {/* Mood & genres */}
      <section>
        <SectionHeader title="Mood dan genre" onMore={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <div className="grid grid-cols-2 gap-3">
          {moods.map((m) => (
            <button key={m.id}
              onClick={() => { setActiveMood(m.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="h-14 px-4 rounded-2xl bg-white/[0.07] border border-white/10 text-left text-[15px] font-semibold text-[#f0e6e5] flex items-center gap-2.5 active:scale-[0.97] transition-transform">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* New releases */}
      {(loading || albums.length > 0) && (
        <section>
          <SectionHeader title="Rilisan baru" />
          {loading ? (
            <div className="flex gap-4 overflow-hidden">{[1, 2, 3].map((n) => <AlbumCardSkeleton key={n} />)}</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4">
              {albums.map((al) => (
                <div key={al.id} onClick={() => playAlbum(al)} className="w-[160px] shrink-0 cursor-pointer group">
                  <div className="relative aspect-square rounded-[24px] overflow-hidden bg-white/10 shadow-xl">
                    {al.thumbnail && <img src={al.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />}
                    <span className="absolute right-2.5 top-2.5 w-10 h-10 rounded-full bg-accent text-ink flex items-center justify-center shadow-lg group-active:scale-90 transition-transform">
                      <Play size={18} className="fill-current ml-0.5" />
                    </span>
                  </div>
                  <p className="mt-2 text-[14.5px] font-semibold text-[#f4eceb] truncate">{al.title}</p>
                  <p className="text-[12.5px] text-muted truncate">{al.artist}{al.year ? ` · ${al.year}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recommended */}
      {recColumns.length > 0 && (
        <section>
          <SectionHeader eyebrow="Pilihan untukmu" title="Lagu tren untukmu" onPlayAll={() => playAll(recommended)} />
          {renderColumns(recColumns, recommended)}
        </section>
      )}

      {/* Artists */}
      {(loading || artists.length > 0) && (
        <section>
          <SectionHeader title="Artis tren" />
          {loading ? (
            <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map((n) => <ArtistCardSkeleton key={n} />)}</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4">
              {artists.map((ar) => (
                <button key={ar.id} onClick={() => playArtist(ar)} className="w-[104px] shrink-0 flex flex-col items-center text-center active:scale-95 transition-transform">
                  <div className="w-[96px] h-[96px] rounded-full overflow-hidden bg-white/10 shadow-lg border border-white/10">
                    {ar.thumbnail && <img src={ar.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />}
                  </div>
                  <p className="mt-2 text-[13.5px] font-semibold text-[#f4eceb] truncate w-full">{ar.name}</p>
                  {ar.subscribers && <p className="text-[11.5px] text-muted truncate w-full">{ar.subscribers}</p>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Floating actions */}
      <div className="fixed right-4 z-30 flex flex-col items-end gap-3 pointer-events-none" style={{ bottom: currentSong ? 168 : 96 }}>
        <button onClick={startVoice} className="pointer-events-auto w-12 h-12 rounded-2xl glass-pill flex items-center justify-center text-accent active:scale-90 transition-transform" aria-label="Cari dengan suara">
          <Mic size={22} />
        </button>
        <button onClick={randomPlay} className="pointer-events-auto w-14 h-14 rounded-[18px] bg-accent text-ink flex items-center justify-center shadow-[0_12px_28px_-8px_rgba(244,182,198,0.55)] active:scale-90 transition-transform" aria-label="Putar acak">
          <Shuffle size={24} />
        </button>
      </div>
    </div>
  );
};
