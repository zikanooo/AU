import React, { useState } from 'react';
import { Heart, History, ListMusic, Trash2, ArrowLeft, Play, MoreVertical, Disc3 } from 'lucide-react';
import { Song } from '../types/music';
import { useMusic } from '../context/MusicContext';

type View = 'grid' | 'favorites' | 'history' | 'queue';

export const LibraryPage: React.FC = () => {
  const { favorites, history, queue, playSong, currentSong, clearHistory, clearQueue, toggleFavorite, setActiveTab } = useMusic();
  const [view, setView] = useState<View>('grid');

  const tiles: { id: Exclude<View, 'grid'>; label: string; count: number; icon: React.ReactNode; cover?: string }[] = [
    { id: 'favorites', label: 'Disukai', count: favorites.length, icon: <Heart size={52} strokeWidth={1.4} />, cover: favorites[0]?.thumbnail },
    { id: 'history', label: 'Riwayat', count: history.length, icon: <History size={52} strokeWidth={1.4} />, cover: history[0]?.thumbnail },
    { id: 'queue', label: 'Antrean', count: queue.length, icon: <ListMusic size={52} strokeWidth={1.4} />, cover: queue[0]?.thumbnail },
  ];

  if (view === 'grid') {
    return (
      <div className="pb-52 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[26px] font-bold tracking-tight">Pustaka</h1>
          <button onClick={() => setActiveTab('profile')} className="text-[13px] text-accent font-medium">Pengaturan</button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          {tiles.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)} className="text-left active:scale-[0.97] transition-transform">
              <div className="relative aspect-square rounded-[26px] overflow-hidden bg-white/[0.08] border border-white/10 flex items-center justify-center text-[#e8cfd6]">
                {t.cover && <img src={t.cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-[2px]" referrerPolicy="no-referrer" />}
                <span className="relative">{t.icon}</span>
              </div>
              <p className="mt-2 text-[15px] font-semibold">{t.label}</p>
              <p className="text-[12.5px] text-muted -mt-0.5">{t.count} lagu</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const list: Song[] = view === 'favorites' ? favorites : view === 'history' ? history : queue;
  const title = view === 'favorites' ? 'Disukai' : view === 'history' ? 'Riwayat' : 'Antrean';

  return (
    <div className="pb-52 space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setView('grid')} className="p-2 -ml-2 text-[#f0e6e5] active:scale-90" aria-label="Kembali"><ArrowLeft size={22} /></button>
        <h1 className="text-[24px] font-bold tracking-tight flex-1">{title}</h1>
        {list.length > 0 && (
          <button onClick={() => playSong(list[0], list)} className="px-4 py-1.5 rounded-full bg-accent text-ink text-[13px] font-bold flex items-center gap-1.5 active:scale-95">
            <Play size={13} className="fill-current" /> Putar semua
          </button>
        )}
      </div>
      {(view === 'history' || view === 'queue') && list.length > 0 && (
        <button onClick={view === 'history' ? clearHistory : clearQueue} className="text-[13px] text-rose-300 flex items-center gap-1.5">
          <Trash2 size={14} /> {view === 'history' ? 'Hapus riwayat' : 'Bersihkan antrean'}
        </button>
      )}

      {list.length === 0 ? (
        <div className="py-20 text-center text-muted space-y-3">
          <Disc3 size={40} className="mx-auto opacity-60" />
          <p className="text-sm">{view === 'favorites' ? 'Ketuk ikon hati pada lagu untuk menyimpannya di sini.' : view === 'history' ? 'Lagu yang kamu putar akan muncul di sini.' : 'Antrean kosong.'}</p>
        </div>
      ) : (
        <div>
          {list.map((song, idx) => {
            const current = currentSong?.id === song.id;
            return (
              <div key={`${song.id}-${idx}`} onClick={() => playSong(song, list)} className="flex items-center gap-3 py-2.5 row-divider cursor-pointer active:opacity-70">
                <img src={song.thumbnail} alt="" className="w-[54px] h-[54px] rounded-[14px] object-cover bg-white/10" referrerPolicy="no-referrer" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : ''}`}>{song.title}</p>
                  <p className="text-[13px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }} className="p-2 active:scale-90" aria-label="Favorit">
                  <Heart size={19} className={favorites.some((f) => f.id === song.id) ? 'text-accent fill-accent' : 'text-[#e9dfde]'} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
