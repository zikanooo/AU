import { Song, Album, Artist, LyricsData, SearchItem } from '../types/music';

// Urutan basis API yang dicoba. Bisa dipaksa lewat VITE_API_BASE (mis. https://api.domain.com).
const ENV_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const BASES = [ENV_BASE, '/music-api', '/api'].filter(Boolean).map((b) => (b as string).replace(/\/$/, ''));
let activeBase = BASES[0];

export interface HomeData {
  quickPicks: Song[];
  charts: Song[];
  moods: { id: string; name: string; color: string }[];
  featuredAlbums: Album[];
  trendingArtists: Artist[];
  updatedAt?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(message: string, public status = 0, public retry = true) { super(message); }
}

/** Satu percobaan ke satu basis. 404/HTML = "bukan backend kita" -> ApiError(status 404). */
async function tryBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { cache: 'no-store', ...init });
  } catch (e: any) {
    throw new ApiError(e?.message || 'Jaringan terputus', 0, true);
  }
  const type = res.headers.get('content-type') || '';
  const isJson = type.includes('json');

  if (res.ok && isJson) return res.json();
  if (res.ok) throw new ApiError('Server membalas bukan JSON (backend belum terhubung)', 404, false);

  let detail = '';
  if (isJson) {
    try { const b = await res.json(); detail = b?.detail || b?.message || ''; } catch {}
  }
  if (res.status === 404 && !isJson) {
    throw new ApiError('Endpoint backend tidak ditemukan', 404, false);
  }
  const retry = res.status >= 500 || res.status === 408 || res.status === 429;
  throw new ApiError(detail || `Server error ${res.status}`, res.status, retry);
}

/** Fetch JSON dengan auto-deteksi basis + retry saat backend masih booting. */
async function getJson<T = any>(path: string, init?: RequestInit, retries = 8): Promise<T> {
  let lastError = 'Backend tidak merespons';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const order = [activeBase, ...BASES.filter((b) => b !== activeBase)];
    let allMissing = true;
    for (const base of order) {
      try {
        const data = await tryBase<T>(base, path, init);
        activeBase = base;
        return data;
      } catch (e: any) {
        lastError = e?.message || lastError;
        if (!(e instanceof ApiError) || e.status !== 404) allMissing = false;
        // Error 4xx "asli" dari backend (mis. 400) tidak perlu dicoba ulang
        if (e instanceof ApiError && !e.retry && e.status !== 404) throw e;
      }
    }
    if (allMissing && attempt >= 2) {
      throw new Error('Backend tidak ditemukan (404). Jalankan lewat "npm run dev" agar backend Python ikut menyala, atau set VITE_API_BASE.');
    }
    await sleep(Math.min(700 + attempt * 400, 3000));
  }
  throw new Error(lastError);
}

const ACCENTS = ['#f43f5e', '#38bdf8', '#fbbf24', '#a855f7', '#10b981', '#6366f1', '#ec4899', '#06b6d4'];

function formatSongItem(raw: any): Song {
  const vid: string = raw.videoId || raw.id;
  const hash = vid.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  return {
    id: vid,
    videoId: vid,
    title: raw.title || 'Tanpa judul',
    artists: raw.artists && raw.artists.length ? raw.artists : [{ name: 'Unknown Artist' }],
    album: raw.album || undefined,
    duration: raw.duration || '',
    durationSeconds: raw.durationSeconds || 0,
    thumbnail: raw.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    accentColor: ACCENTS[hash % ACCENTS.length],
  };
}

export const MusicApi = {
  /** Beranda real-time dari YouTube Music (rekomendasi, chart, mood). */
  async getHome(genre?: string): Promise<HomeData> {
    const qs = genre && genre !== 'semua' ? `?genre=${encodeURIComponent(genre)}` : '';
    const data = await getJson(`/home${qs}`);
    return {
      quickPicks: (data.quickPicks || []).map(formatSongItem),
      charts: (data.charts || []).map(formatSongItem),
      moods: data.moods || [],
      featuredAlbums: data.featuredAlbums || [],
      trendingArtists: data.trendingArtists || [],
      updatedAt: data.updatedAt,
    };
  },

  async search(query: string, filter?: string): Promise<SearchItem[]> {
    if (!query.trim()) return [];
    const params = new URLSearchParams({ q: query });
    if (filter && filter !== 'all') params.set('filter', filter);
    const data = await getJson(`/search?${params}`);
    return (data.results || []).map((r: any): SearchItem => {
      if (r.kind === 'album') return { ...r, kind: 'album' };
      if (r.kind === 'artist') return { ...r, kind: 'artist' };
      return { ...formatSongItem(r), kind: r.kind === 'video' ? 'video' : 'song' };
    });
  },

  async getSong(videoId: string): Promise<Song> {
    return formatSongItem(await getJson(`/song/${videoId}`));
  },

  /** Lagu serupa (radio) untuk antrean otomatis. */
  async getRelated(videoId: string): Promise<Song[]> {
    const data = await getJson(`/related/${videoId}`);
    return (data.results || []).map(formatSongItem);
  },

  getStreamUrl(videoId: string): string {
    return `${activeBase}/stream/${videoId}`;
  },

  /** Lirik tersinkron asli. Kosong jika memang tidak tersedia (tanpa lirik palsu). */
  async getLyrics(videoId: string): Promise<LyricsData> {
    try {
      const data = await getJson(`/lyrics/${videoId}`);
      return {
        isSynced: !!data.isSynced,
        plainLyrics: data.plainLyrics || '',
        syncedLyrics: data.syncedLyrics || [],
        source: data.source || '',
      };
    } catch {
      return { isSynced: false, plainLyrics: '', syncedLyrics: [], source: '' };
    }
  },

  async getAlbum(id: string): Promise<Album> {
    const data = await getJson(`/album/${id}`);
    const album = data.album;
    return { ...album, tracks: (album.tracks || []).map(formatSongItem) };
  },

  async getArtist(id: string): Promise<{ artist: Artist; songs: Song[] }> {
    const data = await getJson(`/artist/${id}`);
    return { artist: data.artist, songs: (data.songs || []).map(formatSongItem) };
  },
};
