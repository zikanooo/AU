import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, X, MoreVertical, History, ArrowUpLeft, Mic, Disc3, User } from 'lucide-react';
import { Song, SearchItem } from '../types/music';
import { MusicApi } from '../services/api';
import { useMusic } from '../context/MusicContext';
import { SongCardSkeleton } from '../components/SkeletonLoader';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'videos', label: 'Videos' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
];

const RECENT_KEY = 'liquid_recent_searches';

export const SearchPage: React.FC = () => {
  const { playSong, addToQueue, currentSong, setActiveTab, showToast } = useMusic();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [recs, setRecs] = useState<Song[]>([]);
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  });
  const timer = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    MusicApi.getHome()
      .then((d) => setRecs((d.charts.length ? d.charts : d.quickPicks).slice(0, 8)))
      .catch(() => setRecs([]));
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setIsSearching(false); setError(''); return; }
    setIsSearching(true);
    clearTimeout(timer.current);
    let alive = true;
    timer.current = setTimeout(() => {
      MusicApi.search(query, filter)
        .then((r) => { if (alive) { setResults(r); setError(''); setIsSearching(false); } })
        .catch(() => { if (alive) { setError('Pencarian gagal. Periksa backend lalu coba lagi.'); setIsSearching(false); } });
    }, 320);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [query, filter]);

  const remember = (q: string) => {
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };
  const forget = (q: string) => {
    const next = recent.filter((r) => r !== q);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  // Pencarian suara (Web Speech API)
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('Pencarian suara tidak didukung browser ini'); return; }
    const rec = new SR();
    rec.lang = 'id-ID';
    rec.interimResults = false;
    rec.onresult = (e: any) => setQuery(e.results[0][0].transcript);
    rec.onerror = () => showToast('Tidak bisa mendengar suara');
    showToast('Mendengarkan...');
    rec.start();
  };
  useEffect(() => {
    const h = () => startVoice();
    window.addEventListener('voice-search', h);
    return () => window.removeEventListener('voice-search', h);
  });

  const playItem = async (item: SearchItem, list: Song[]) => {
    remember(query.trim());
    try {
      if (item.kind === 'album') {
        const a = await MusicApi.getAlbum(item.id);
        if (a.tracks?.length) playSong(a.tracks[0], a.tracks);
      } else if (item.kind === 'artist') {
        const { songs } = await MusicApi.getArtist(item.id!);
        if (songs.length) playSong(songs[0], songs);
      } else {
        playSong(item, list);
      }
    } catch {
      showToast('Gagal memuat, coba lagi');
    }
  };

  const songList = results.filter((r): r is Song & { kind: 'song' | 'video' } => r.kind === 'song' || r.kind === 'video');

  const renderResult = (item: SearchItem) => {
    const isVideo = item.kind === 'video';
    const isArtist = item.kind === 'artist';
    const current = (item.kind === 'song' || item.kind === 'video') && currentSong?.id === item.id;
    const thumb = (item as any).thumbnail as string | undefined;
    const title = item.kind === 'artist' ? item.name : item.title;
    let sub = '';
    if (item.kind === 'song' || item.kind === 'video') sub = [item.artists.map((a) => a.name).join(', '), item.duration].filter(Boolean).join(' • ');
    else if (item.kind === 'album') sub = ['Album', item.artist, item.year].filter(Boolean).join(' • ');
    else sub = ['Artis', item.subscribers].filter(Boolean).join(' • ');

    return (
      <div key={`${item.kind}-${item.id}`} onClick={() => playItem(item, songList)}
        className="flex items-center gap-3 py-2.5 row-divider cursor-pointer active:opacity-70">
        <div className={`shrink-0 overflow-hidden bg-white/10 ${isVideo ? 'w-[88px] h-[50px] rounded-xl' : isArtist ? 'w-[54px] h-[54px] rounded-full' : 'w-[54px] h-[54px] rounded-[14px]'}`}>
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center text-muted">{isArtist ? <User size={20} /> : <Disc3 size={20} />}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{title}</p>
          <p className="text-[13px] text-muted truncate">{sub}</p>
        </div>
        {(item.kind === 'song' || item.kind === 'video') && (
          <button onClick={(e) => { e.stopPropagation(); addToQueue(item); showToast('Ditambahkan ke antrean'); }}
            className="p-2 text-[#e9dfde] active:scale-90" aria-label="Tambah ke antrean">
            <MoreVertical size={20} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="pb-52 space-y-5">
      {/* Search field */}
      <div className="flex items-center gap-1 h-14 pl-2 pr-1 rounded-full bg-white/[0.08] border border-white/12 backdrop-blur-xl">
        <button onClick={() => (query ? (setQuery(''), setFilter('all')) : setActiveTab('home'))} className="p-2.5 text-[#f0e6e5] active:scale-90" aria-label="Kembali">
          <ArrowLeft size={22} />
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && query.trim() && remember(query.trim())}
          placeholder="Cari lagu, artis, album"
          enterKeyHint="search"
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] text-[#f4eceb] placeholder:text-muted select-text"
        />
        {query ? (
          <button onClick={() => setQuery('')} className="p-2.5 text-[#f0e6e5] active:scale-90" aria-label="Hapus"><X size={20} /></button>
        ) : (
          <button onClick={startVoice} className="p-2.5 text-accent active:scale-90" aria-label="Suara"><Mic size={20} /></button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`chip ${filter === f.id ? 'chip-active' : ''}`}>{f.label}</button>
        ))}
      </div>

      {!query.trim() ? (
        <div className="space-y-6">
          {recent.length > 0 && (
            <div>
              {recent.map((r) => (
                <div key={r} className="flex items-center gap-3 py-3 row-divider">
                  <History size={20} className="text-muted shrink-0" />
                  <button onClick={() => setQuery(r)} className="flex-1 text-left text-[16px] text-[#f0e6e5] truncate">{r}</button>
                  <button onClick={() => forget(r)} className="p-1.5 text-muted active:scale-90" aria-label="Hapus riwayat"><X size={18} /></button>
                  <button onClick={() => { setQuery(r); inputRef.current?.focus(); }} className="p-1.5 text-muted active:scale-90" aria-label="Pakai"><ArrowUpLeft size={18} /></button>
                </div>
              ))}
            </div>
          )}
          {recs.length > 0 && (
            <div>
              <h3 className="text-[20px] font-bold mb-2">Trending sekarang</h3>
              {recs.map((s) => (
                <div key={s.id} onClick={() => playSong(s, recs)} className="flex items-center gap-3 py-2.5 row-divider cursor-pointer active:opacity-70">
                  <img src={s.thumbnail} alt="" className="w-[54px] h-[54px] rounded-[14px] object-cover bg-white/10" referrerPolicy="no-referrer" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15.5px] font-semibold truncate">{s.title}</p>
                    <p className="text-[13px] text-muted truncate">{s.artists.map((a) => a.name).join(', ')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isSearching ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((n) => <SongCardSkeleton key={n} />)}</div>
      ) : error ? (
        <p className="text-center text-sm text-rose-300 py-10">{error}</p>
      ) : results.length === 0 ? (
        <p className="text-center text-sm text-muted py-10">Tidak ada hasil untuk “{query}”</p>
      ) : (
        <div>{results.map(renderResult)}</div>
      )}
    </div>
  );
};
