import React from 'react';
import { motion } from 'motion/react';
import { Play, Pause, SkipForward, Heart, Music } from 'lucide-react';
import { useMusic } from '../context/MusicContext';

export const MiniPlayer: React.FC = () => {
  const {
    currentSong, isPlaying, currentTime, duration, togglePlay, nextSong,
    setIsPlayerExpanded, toggleFavorite, isFavorite, activeTab,
  } = useMusic();
  const noTabs = activeTab === 'profile' || activeTab === 'together';

  if (!currentSong) return null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const fav = isFavorite(currentSong.id);

  return (
    <div className={`fixed ${noTabs ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]' : 'bottom-[88px]'} left-0 right-0 z-30 flex justify-center px-4 pointer-events-none`}>
      <div className={`w-full max-w-[440px] ${isPlaying ? 'mini-float' : ''}`}>
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => setIsPlayerExpanded(true)}
          className="pointer-events-auto relative rounded-full glass-pill p-1.5 pr-3 flex items-center gap-3 cursor-pointer overflow-hidden"
        >
          <div className="w-11 h-11 rounded-[14px] overflow-hidden shrink-0 bg-white/10">
            {currentSong.thumbnail ? (
              <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted"><Music size={18} /></div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-semibold text-[#f4eceb] truncate leading-tight">{currentSong.title}</h4>
            <p className="text-[12.5px] text-muted truncate mt-0.5">{currentSong.artists.map((a) => a.name).join(', ')}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleFavorite(currentSong)}
              className="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform"
              aria-label={fav ? 'Hapus favorit' : 'Tambah favorit'}
            >
              <Heart size={20} className={fav ? 'text-accent fill-accent' : 'text-[#e9dfde]'} />
            </button>
            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-accent text-ink flex items-center justify-center active:scale-90 transition-transform"
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
            >
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-0.5" />}
            </button>
            <button onClick={nextSong} className="w-9 h-9 flex items-center justify-center text-[#f0e6e5] active:scale-90 transition-transform" aria-label="Berikutnya">
              <SkipForward size={20} className="fill-current" />
            </button>
          </div>

          <div className="absolute left-5 right-5 bottom-0 h-[2px] bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </motion.div>
      </div>
    </div>
  );
};
