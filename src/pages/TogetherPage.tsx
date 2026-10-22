import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, Link2, LogOut, Plus, Settings2, User, Users, Radio } from 'lucide-react';
import { useMusic } from '../context/MusicContext';
import { Song } from '../types/music';

type Member = { id: string; name: string; host: boolean };
type Msg =
  | { t: 'hello'; member: Member }
  | { t: 'members'; list: Member[] }
  | { t: 'bye'; id: string }
  | { t: 'state'; from: string; song: Song | null; queue: Song[]; playing: boolean; time: number };

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const myId = (() => { let v = sessionStorage.getItem('auralys_uid'); if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('auralys_uid', v); } return v; })();

export const TogetherPage: React.FC = () => {
  const { setActiveTab, showToast, currentSong, isPlaying, queue, currentTime, playSong, pause, resume, seek } = useMusic();
  const [username, setUsername] = useState(() => localStorage.getItem('auralys_username') || '');
  const [codeInput, setCodeInput] = useState(() => (location.hash.match(/join=([A-Z0-9]{4,12})/i)?.[1] || '').toUpperCase());
  const [session, setSession] = useState<{ code: string; host: boolean } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const chRef = useRef<BroadcastChannel | null>(null);
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;
  const lastSent = useRef('');

  const link = useMemo(() => (session ? `${location.origin}${location.pathname}#join=${session.code}` : ''), [session]);

  const leave = () => {
    chRef.current?.postMessage({ t: 'bye', id: myId } satisfies Msg);
    chRef.current?.close();
    chRef.current = null;
    setSession(null);
    setMembers([]);
  };

  const start = (code: string, host: boolean) => {
    const name = username.trim();
    if (!name) { showToast('Isi username dulu'); return; }
    localStorage.setItem('auralys_username', name);
    const ch = new BroadcastChannel(`auralys-together-${code}`);
    chRef.current = ch;
    const me: Member = { id: myId, name, host };
    setMembers([me]);
    setSession({ code, host });
    ch.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.t === 'hello') {
        const list = [...membersRef.current.filter((x) => x.id !== m.member.id), m.member];
        setMembers(list);
        if (host) ch.postMessage({ t: 'members', list } satisfies Msg);
      } else if (m.t === 'members') setMembers(m.list);
      else if (m.t === 'bye') setMembers((l) => l.filter((x) => x.id !== m.id));
      else if (m.t === 'state' && !host && m.song) {
        if (!currentRef.current || currentRef.current !== m.song.id) playSong(m.song, m.queue.length ? m.queue : [m.song]);
        else { if (Math.abs(m.time - timeRef.current) > 3) seek(m.time); }
        if (m.playing) resume(); else pause();
      }
    };
    ch.postMessage({ t: 'hello', member: me } satisfies Msg);
    showToast(host ? `Sesi dibuat: ${code}` : `Bergabung: ${code}`);
  };

  const currentRef = useRef<string | undefined>(undefined);
  const timeRef = useRef(0);
  currentRef.current = currentSong?.id;
  timeRef.current = currentTime;

  // Host menyiarkan lagu/status ke semua anggota
  useEffect(() => {
    if (!session?.host || !chRef.current) return;
    const key = `${currentSong?.id}|${isPlaying}`;
    if (key === lastSent.current) return;
    lastSent.current = key;
    chRef.current.postMessage({ t: 'state', from: myId, song: currentSong, queue: queue.slice(0, 30), playing: isPlaying, time: currentTime } satisfies Msg);
  }, [session, currentSong, isPlaying, queue, currentTime]);

  useEffect(() => () => { chRef.current?.close(); }, []);

  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); showToast(msg); } catch { showToast('Gagal menyalin'); }
  };

  return (
    <div className="pb-32 pt-1">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 active:scale-90" aria-label="Kembali"><ArrowLeft size={24} /></button>
        <h1 className="text-[24px] font-bold tracking-tight">Dengar bersama</h1>
      </div>

      {!session ? (
        <>
          <p className="text-[13.5px] text-muted leading-snug mb-4">
            Dengarkan lagu yang sama secara bersamaan. Buat ruangan untuk menjadi host, atau bergabung ke ruangan yang ada dengan kode.
          </p>
          <div className="glass-panel rounded-[22px] p-3.5 mb-3 flex items-center gap-2 text-[13px] text-[#e9dfde]">
            <Radio size={15} className="text-accent" /> Siap · sinkron antartab di peramban ini
          </div>

          <div className="glass-panel rounded-[22px] p-3.5 space-y-3">
            <label className="flex items-center gap-3 px-3 h-14 rounded-2xl border border-accent/70 bg-white/[0.04]">
              <User size={18} className="text-muted" />
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" maxLength={20}
                className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-muted" />
            </label>
            <label className="flex items-center gap-3 px-3 h-14 rounded-2xl border border-white/15 bg-white/[0.04]">
              <Users size={18} className="text-muted" />
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Kode sesi" maxLength={12}
                className="flex-1 bg-transparent outline-none text-[16px] tracking-widest placeholder:text-muted placeholder:tracking-normal" />
            </label>
            <button
              onClick={() => (codeInput.length >= 4 ? start(codeInput, false) : start(makeCode(), true))}
              className="w-full h-14 rounded-2xl bg-accent text-ink font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              {codeInput.length >= 4 ? <>Gabung</> : <><Plus size={19} /> Buat</>}
            </button>
          </div>

          <button onClick={() => setActiveTab('profile')} className="glass-panel rounded-[22px] w-full mt-3 p-4 flex items-center gap-3 text-left active:scale-[0.99]">
            <Settings2 size={22} className="text-accent" />
            <span className="flex-1">
              <span className="block text-[15.5px] font-semibold">Pengaturan</span>
              <span className="block text-[12.5px] text-muted">Konfigurasi tampilan, pemutar, dan lainnya</span>
            </span>
            <ChevronRight size={19} />
          </button>
        </>
      ) : (
        <>
          <div className="glass-panel rounded-[22px] p-5 text-center">
            <p className="text-[12px] text-muted">Kode sesi</p>
            <p className="text-[34px] font-extrabold tracking-[0.12em] my-1.5">{session.code}</p>
            <p className="text-[13px] text-muted mb-4">{session.host ? 'Kamu adalah host' : 'Kamu bergabung sebagai tamu'}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => copy(link, 'Tautan disalin')} className="h-12 rounded-2xl bg-accent/25 text-accent font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95"><Link2 size={16} /> Salin link</button>
              <button onClick={() => copy(session.code, 'Kode disalin')} className="h-12 rounded-2xl bg-accent/25 text-accent font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95"><Copy size={16} /> Salin kode</button>
            </div>
          </div>

          <div className="glass-panel rounded-[22px] p-4 mt-3">
            <p className="text-[15.5px] font-semibold mb-3">Pengguna tersambung ({members.length})</p>
            <div className="flex gap-4 flex-wrap">
              {members.map((m) => (
                <div key={m.id} className="w-16 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-accent text-ink font-bold text-[18px] flex items-center justify-center">{m.name.slice(0, 1).toUpperCase()}</div>
                  <p className="text-[12px] mt-1.5 truncate w-full">{m.name}</p>
                  {m.host && <p className="text-[10.5px] text-accent">Host</p>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={leave} className="w-full mt-3 h-13 py-3.5 rounded-2xl bg-[#f0626a] text-white font-bold text-[15.5px] flex items-center justify-center gap-2 active:scale-[0.98]">
            <LogOut size={18} /> Keluar sesi
          </button>
          {!session.host && <p className="text-[12px] text-muted text-center mt-3">Lagu mengikuti host. Putar sesuatu di tab host untuk memulai.</p>}
        </>
      )}
    </div>
  );
};
