import React, { useState } from 'react';
import {
  ArrowLeft, ChevronRight, Palette, PlayCircle, Languages, Car, ShieldCheck, HardDrive,
  DatabaseBackup, Info, Sparkles, Droplets, Gauge, Smartphone, PaintBucket, Paintbrush, Layers, Vibrate, Trash2,
  Download, Upload,
} from 'lucide-react';
import { useMusic } from '../context/MusicContext';
import { GlassSettings } from '../types/music';

type View = 'root' | 'appearance' | 'player' | 'privacy' | 'storage' | 'backup' | 'about';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }} className="switch" />
);

const IconTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0">{children}</span>
);

const Group: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    {label && <p className="set-group-label">{label}</p>}
    <div className="set-card glass-panel">{children}</div>
  </>
);

const NavRow: React.FC<{ icon: React.ReactNode; title: string; desc?: string; onClick: () => void }> = ({ icon, title, desc, onClick }) => (
  <button onClick={onClick} className="set-row">
    <IconTile>{icon}</IconTile>
    <span className="flex-1 min-w-0">
      <span className="block text-[15.5px] font-semibold text-[#f4eceb]">{title}</span>
      {desc && <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{desc}</span>}
    </span>
    <ChevronRight size={19} className="text-[#cfc5c7] shrink-0" />
  </button>
);

const ToggleRow: React.FC<{ icon: React.ReactNode; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }> = ({ icon, title, desc, on, onChange }) => (
  <div className="set-row cursor-pointer" onClick={() => onChange(!on)}>
    <IconTile>{icon}</IconTile>
    <span className="flex-1 min-w-0">
      <span className="block text-[15.5px] font-semibold text-[#f4eceb]">{title}</span>
      <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{desc}</span>
    </span>
    <Switch on={on} onChange={onChange} label={title} />
  </div>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; unit: string; onChange: (n: number) => void }> = ({ label, value, min, max, unit, onChange }) => (
  <div className="px-4 py-3.5 space-y-2 border-t border-white/[0.08]">
    <div className="flex justify-between text-[13px]">
      <span className="text-[#e9dfde]">{label}</span>
      <span className="font-mono text-accent font-semibold">{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20" style={{ accentColor: 'var(--accent)' }} />
  </div>
);

export const ProfilePage: React.FC = () => {
  const { glassSettings: g, updateGlassSettings, favorites, history, clearHistory, setActiveTab, showToast } = useMusic();
  const [view, setView] = useState<View>('root');
  const set = (p: Partial<GlassSettings>) => updateGlassSettings(p);

  const titles: Record<View, string> = {
    root: 'Pengaturan', appearance: 'Tampilan', player: 'Pemutar dan audio', privacy: 'Privasi',
    storage: 'Penyimpanan', backup: 'Pencadangan dan Pemulihan', about: 'Tentang',
  };
  const back = () => (view === 'root' ? setActiveTab('home') : setView('root'));
  const soon = () => showToast('Belum tersedia di versi web');

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'auralys', favorites, history, settings: g }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'auralys-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Cadangan diunduh');
  };
  const importData = (file?: File) => {
    if (!file) return;
    file.text().then((txt) => {
      try {
        const d = JSON.parse(txt);
        if (Array.isArray(d.favorites)) localStorage.setItem('liquid_music_favorites', JSON.stringify(d.favorites));
        if (Array.isArray(d.history)) localStorage.setItem('liquid_music_history', JSON.stringify(d.history));
        if (d.settings) localStorage.setItem('liquid_glass_settings', JSON.stringify(d.settings));
        showToast('Dipulihkan, memuat ulang...');
        setTimeout(() => location.reload(), 700);
      } catch { showToast('File cadangan tidak valid'); }
    });
  };

  return (
    <div className="pb-32 pt-1">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={back} className="p-2 -ml-2 text-[#f4eceb] active:scale-90" aria-label="Kembali"><ArrowLeft size={24} /></button>
        <h1 className="text-[24px] font-bold tracking-tight">{titles[view]}</h1>
      </div>

      {view === 'root' && (
        <>
          <Group label="Antarmuka">
            <NavRow icon={<Palette size={20} />} title="Tampilan" onClick={() => setView('appearance')} />
          </Group>
          <Group label="Pemutar & Konten">
            <NavRow icon={<PlayCircle size={20} />} title="Pemutar dan audio" onClick={() => setView('player')} />
            <NavRow icon={<Layers size={20} />} title="Konten" onClick={soon} />
            <NavRow icon={<Languages size={20} />} title="Terjemahan lirik AI" onClick={soon} />
          </Group>
          <Group label="Android Auto">
            <NavRow icon={<Car size={20} />} title="Android Auto" onClick={soon} />
          </Group>
          <Group label="Privasi & Keamanan">
            <NavRow icon={<ShieldCheck size={20} />} title="Privasi" onClick={() => setView('privacy')} />
          </Group>
          <Group label="Penyimpanan & Data">
            <NavRow icon={<HardDrive size={20} />} title="Penyimpanan" onClick={() => setView('storage')} />
            <NavRow icon={<DatabaseBackup size={20} />} title="Pencadangan dan Pemulihan" onClick={() => setView('backup')} />
          </Group>
          <Group label="Sistem & Tentang">
            <NavRow icon={<Info size={20} />} title="Tentang Auralys" desc="Versi 3.1 · YouTube Music · LRCLIB" onClick={() => setView('about')} />
          </Group>
        </>
      )}

      {view === 'appearance' && (
        <>
          <p className="set-group-label">Tema</p>
          <div className="set-card glass-panel">
            <div className="set-row">
              <IconTile><Sparkles size={20} /></IconTile>
              <span className="flex-1">
                <span className="block text-[15.5px] font-semibold">Gaya tampilan</span>
                <span className="block text-[12.5px] text-muted">Liquid Glass</span>
              </span>
            </div>
            <ToggleRow icon={<Droplets size={20} />} title="Efek kaca (blur)" desc="Mengaburkan latar di bar bawah dan dialog. Matikan jika terasa berat." on={g.blurEnabled} onChange={(v) => set({ blurEnabled: v })} />
            {g.blurEnabled && <Slider label="Tingkat blur" value={g.blurIntensity} min={12} max={40} unit="px" onChange={(n) => set({ blurIntensity: n })} />}
            <ToggleRow icon={<Gauge size={20} />} title="Aktifkan refresh rate tinggi" desc="Memakai animasi penuh dan mengambang agar lebih halus (mis. 120Hz)." on={g.highRefresh} onChange={(v) => set({ highRefresh: v })} />
            <ToggleRow icon={<Smartphone size={20} />} title="Pengukuran landscape" desc="Perlebar tampilan pada mode landscape untuk ruang lebih besar." on={g.landscape} onChange={(v) => set({ landscape: v })} />
            <ToggleRow icon={<PaintBucket size={20} />} title="Aktifkan tema dinamis" desc="Warna aplikasi mengikuti cover lagu yang sedang diputar." on={g.dynamicTheme} onChange={(v) => set({ dynamicTheme: v })} />
            <ToggleRow icon={<Paintbrush size={20} />} title="Warna ikon dinamis" desc="Warna bilah status peramban ikut berubah mengikuti tema." on={g.dynamicIcon} onChange={(v) => set({ dynamicIcon: v })} />
            <ToggleRow icon={<Layers size={20} />} title="Latar mesh dinamis" desc="Cahaya lembut bergerak di belakang konten." on={g.dynamicMesh} onChange={(v) => set({ dynamicMesh: v })} />
            {g.dynamicMesh && <Slider label="Kecepatan mesh" value={Math.round(g.meshSpeed * 10)} min={5} max={20} unit="" onChange={(n) => set({ meshSpeed: n / 10 })} />}
          </div>
          <Group label="Pemutar mini">
            <ToggleRow icon={<Vibrate size={20} />} title="Getaran haptik" desc="Getar singkat saat berpindah tab (jika perangkat mendukung)." on={g.hapticFeedback} onChange={(v) => set({ hapticFeedback: v })} />
          </Group>
        </>
      )}

      {view === 'player' && (
        <Group label="Kualitas audio">
          {([['normal', 'Normal', 'Hemat data'], ['high', 'Tinggi', 'Seimbang (disarankan)'], ['lossless', 'Terbaik', 'Bitrate tertinggi yang tersedia']] as const).map(([id, name, desc]) => (
            <button key={id} onClick={() => set({ audioQuality: id })} className="set-row">
              <span className="flex-1">
                <span className="block text-[15.5px] font-semibold">{name}</span>
                <span className="block text-[12.5px] text-muted">{desc}</span>
              </span>
              <span className={`w-5 h-5 rounded-full border-2 ${g.audioQuality === id ? 'border-accent bg-accent' : 'border-white/40'}`} />
            </button>
          ))}
        </Group>
      )}

      {view === 'privacy' && (
        <Group label="Data lokal">
          <button className="set-row" onClick={() => { clearHistory(); showToast('Riwayat dihapus'); }}>
            <IconTile><Trash2 size={20} /></IconTile>
            <span className="flex-1">
              <span className="block text-[15.5px] font-semibold">Hapus riwayat putar</span>
              <span className="block text-[12.5px] text-muted">{history.length} lagu tersimpan di perangkat ini</span>
            </span>
          </button>
        </Group>
      )}

      {view === 'storage' && (
        <Group label="Tersimpan di perangkat">
          <div className="set-row"><span className="flex-1 text-[15.5px] font-semibold">Lagu favorit</span><span className="font-mono text-accent">{favorites.length}</span></div>
          <div className="set-row"><span className="flex-1 text-[15.5px] font-semibold">Riwayat putar</span><span className="font-mono text-accent">{history.length}</span></div>
        </Group>
      )}

      {view === 'backup' && (
        <Group label="Cadangkan & pulihkan">
          <button className="set-row" onClick={exportData}>
            <IconTile><Download size={20} /></IconTile>
            <span className="flex-1"><span className="block text-[15.5px] font-semibold">Ekspor cadangan</span><span className="block text-[12.5px] text-muted">Favorit, riwayat, dan pengaturan (.json)</span></span>
          </button>
          <label className="set-row cursor-pointer">
            <IconTile><Upload size={20} /></IconTile>
            <span className="flex-1"><span className="block text-[15.5px] font-semibold">Pulihkan dari file</span><span className="block text-[12.5px] text-muted">Pilih file cadangan Auralys</span></span>
            <input type="file" accept="application/json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} />
          </label>
        </Group>
      )}

      {view === 'about' && (
        <Group label="Auralys">
          <div className="p-5 text-[14px] text-[#e9dfde] leading-relaxed">
            Pemutar musik bergaya Liquid Glass dengan warna dinamis dari cover. Data lagu dari YouTube Music, lirik dari YouTube Music / LRCLIB.
          </div>
        </Group>
      )}
    </div>
  );
};
