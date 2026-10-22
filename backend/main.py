"""
Liquid Music - FastAPI Backend
100% data nyata dari YouTube Music (ytmusicapi) + lirik tersinkron (YTMusic / LRCLIB).
Tidak ada data palsu: kalau sumber gagal, API mengembalikan error (atau data cache terakhir).
"""

import os
import re
import time
import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("liquid-music")

app = FastAPI(title="Liquid Music API", version="3.1.0")


@app.middleware("http")
async def strip_api_prefix(request, call_next):
    """Terima /music-api/xxx dan /api/xxx sebagai /xxx -> tidak ada lagi 404 karena beda prefix."""
    path = request.scope.get("path", "")
    for prefix in ("/music-api", "/api"):
        if path == prefix or path.startswith(prefix + "/"):
            request.scope["path"] = path[len(prefix):] or "/"
            if "raw_path" in request.scope:
                request.scope["raw_path"] = request.scope["path"].encode()
            break
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
# Konfigurasi
# --------------------------------------------------------------------------- #
LOCATION = os.environ.get("YTM_LOCATION", "ID")          # lokasi rekomendasi YT Music
CHART_COUNTRY = os.environ.get("YTM_CHART_COUNTRY", LOCATION)  # negara chart; "ZZ" = global
AUTH_FILE = os.environ.get("YTM_AUTH")                    # opsional: browser.json / oauth.json -> rekomendasi personal

TTL_HOME = 5 * 60
TTL_CHARTS = 10 * 60
TTL_MOOD = 10 * 60
TTL_SEARCH = 2 * 60
TTL_META = 60 * 60
TTL_LYRICS = 24 * 60 * 60
TTL_STREAM = 30 * 60

# --------------------------------------------------------------------------- #
# YTMusic client
# --------------------------------------------------------------------------- #
ytmusic = None
try:
    from ytmusicapi import YTMusic

    if AUTH_FILE and os.path.exists(AUTH_FILE):
        ytmusic = YTMusic(AUTH_FILE, location=LOCATION)
        log.info("ytmusicapi aktif (terautentikasi, rekomendasi personal)")
    else:
        ytmusic = YTMusic(location=LOCATION)
        log.info("ytmusicapi aktif (anonim, lokasi=%s)", LOCATION)
except Exception as e:  # pragma: no cover
    log.error("Gagal inisialisasi ytmusicapi: %s", e)


def need_yt():
    if ytmusic is None:
        raise HTTPException(503, "ytmusicapi tidak tersedia di server")
    return ytmusic


# --------------------------------------------------------------------------- #
# Cache TTL + stale-while-error + anti-stampede
# --------------------------------------------------------------------------- #
_cache: Dict[str, Tuple[float, Any]] = {}
_locks: Dict[str, asyncio.Lock] = {}


async def cached(key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> Any:
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
        try:
            value = await producer()
        except Exception as e:
            if hit:  # sajikan data lama daripada error
                log.warning("refresh %s gagal (%s), pakai cache lama", key, e)
                return hit[1]
            raise
        _cache[key] = (time.time(), value)
        if len(_cache) > 600:  # batasi memori
            for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
                _cache.pop(k, None)
        return value


async def run(fn, *a, **kw):
    return await asyncio.to_thread(fn, *a, **kw)


# --------------------------------------------------------------------------- #
# Normalisasi
# --------------------------------------------------------------------------- #
def best_thumb(thumbs: Any) -> Optional[str]:
    if not thumbs:
        return None
    if isinstance(thumbs, dict):
        thumbs = thumbs.get("thumbnails") or []
    try:
        t = max(thumbs, key=lambda x: (x.get("width") or 0) * (x.get("height") or 0))
    except Exception:
        return None
    url = t.get("url")
    if not url:
        return None
    # Perbesar cover Google (lh3 / ggpht) agar tajam
    if "googleusercontent.com" in url or "ggpht.com" in url:
        url = re.sub(r"=(w\d+-h\d+|s\d+).*$", "=w600-h600-l90-rj", url)
    return url


def to_seconds(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    parts = str(value).split(":")
    try:
        nums = [int(p) for p in parts]
    except ValueError:
        return None
    secs = 0
    for n in nums:
        secs = secs * 60 + n
    return secs


def fmt_duration(secs: Optional[int]) -> str:
    if not secs:
        return ""
    return f"{secs // 60}:{secs % 60:02d}"


def norm_artists(item: dict) -> List[dict]:
    out = []
    arts = item.get("artists")
    if isinstance(arts, list):
        for a in arts:
            if isinstance(a, dict) and a.get("name"):
                out.append({"name": a["name"], "id": a.get("id")})
            elif isinstance(a, str):
                out.append({"name": a})
    if not out and item.get("artist"):
        out.append({"name": item["artist"]})
    if not out and item.get("author"):
        out.append({"name": item["author"]})
    return out or [{"name": "Unknown Artist"}]


def norm_song(item: dict, fallback_thumb: Optional[str] = None, fallback_album: Optional[dict] = None) -> Optional[dict]:
    vid = item.get("videoId")
    if not vid:
        return None
    secs = item.get("duration_seconds") or to_seconds(item.get("duration") or item.get("length"))
    album = item.get("album")
    if isinstance(album, dict) and album.get("name"):
        album = {"name": album["name"], "id": album.get("id")}
    elif isinstance(album, str):
        album = {"name": album}
    else:
        album = fallback_album
    return {
        "id": vid,
        "videoId": vid,
        "title": item.get("title") or "Tanpa judul",
        "artists": norm_artists(item),
        "album": album,
        "duration": fmt_duration(secs),
        "durationSeconds": secs or 0,
        "thumbnail": best_thumb(item.get("thumbnails") or item.get("thumbnail")) or fallback_thumb
        or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "isExplicit": bool(item.get("isExplicit")),
    }


def norm_album(item: dict) -> Optional[dict]:
    bid = item.get("browseId")
    if not bid or not str(bid).startswith("MPRE"):
        return None
    artists = norm_artists(item)
    return {
        "id": bid,
        "title": item.get("title") or "Album",
        "artist": ", ".join(a["name"] for a in artists) if item.get("artists") else (item.get("artist") or "Various Artists"),
        "year": str(item.get("year") or ""),
        "thumbnail": best_thumb(item.get("thumbnails")),
        "tracksCount": item.get("trackCount") or 0,
    }


def norm_artist(item: dict) -> Optional[dict]:
    bid = item.get("browseId")
    if not bid:
        return None
    return {
        "id": bid,
        "name": item.get("artist") or item.get("title") or "Artist",
        "subscribers": item.get("subscribers") or item.get("views") or "",
        "thumbnail": best_thumb(item.get("thumbnails")),
    }


def dedupe(items: List[dict], key: str = "id") -> List[dict]:
    seen, out = set(), []
    for it in items:
        k = it.get(key)
        if k and k not in seen:
            seen.add(k)
            out.append(it)
    return out


# --------------------------------------------------------------------------- #
# Sumber data beranda
# --------------------------------------------------------------------------- #
def _collect_home(yt) -> Dict[str, list]:
    """Rekomendasi asli dari get_home(): quick picks, album, artis."""
    shelves = yt.get_home(limit=8) or []
    quick, other_songs, albums, artists = [], [], [], []
    for shelf in shelves:
        title = (shelf.get("title") or "").lower()
        contents = shelf.get("contents") or []
        songs = [s for s in (norm_song(c) for c in contents if isinstance(c, dict)) if s]
        if songs:
            if "quick" in title or "pilihan cepat" in title or "kilat" in title:
                quick.extend(songs)
            else:
                other_songs.extend(songs)
        for c in contents:
            if not isinstance(c, dict):
                continue
            a = norm_album(c)
            if a:
                albums.append(a)
            elif str(c.get("browseId", "")).startswith("UC"):
                ar = norm_artist(c)
                if ar:
                    artists.append(ar)
    return {
        "quick": dedupe(quick or other_songs)[:16],
        "extra": dedupe(other_songs),
        "albums": dedupe(albums),
        "artists": dedupe(artists),
    }


def _collect_charts(yt) -> Dict[str, list]:
    """Chart & trending asli per negara (get_charts) + new releases (get_explore)."""
    out = {"songs": [], "artists": [], "albums": []}
    try:
        charts = yt.get_charts(CHART_COUNTRY) or {}
        for section in ("songs", "trending", "videos"):
            sec = charts.get(section)
            items = sec.get("items") if isinstance(sec, dict) else sec
            for it in items or []:
                s = norm_song(it) if isinstance(it, dict) else None
                if s:
                    out["songs"].append(s)
        arts = charts.get("artists")
        arts = arts.get("items") if isinstance(arts, dict) else arts
        for it in arts or []:
            a = norm_artist(it) if isinstance(it, dict) else None
            if a:
                out["artists"].append(a)
    except Exception as e:
        log.warning("get_charts gagal: %s", e)

    try:
        explore = yt.get_explore() if hasattr(yt, "get_explore") else {}
        for it in (explore.get("new_releases") or []):
            a = norm_album(it)
            if a:
                out["albums"].append(a)
        for section in ("top_songs", "trending"):
            sec = explore.get(section)
            items = sec.get("items") if isinstance(sec, dict) else sec
            for it in items or []:
                s = norm_song(it) if isinstance(it, dict) else None
                if s:
                    out["songs"].append(s)
    except Exception as e:
        log.warning("get_explore gagal: %s", e)

    out["songs"] = dedupe(out["songs"])
    out["artists"] = dedupe(out["artists"])
    out["albums"] = dedupe(out["albums"])
    return out


MOOD_KEYWORDS = {
    "feelgood": ["feel good", "happy", "bahagia", "ceria"],
    "sad": ["sad", "sedih", "broken", "patah"],
    "energi": ["energ", "workout", "olahraga", "semangat", "pumped"],
    "chill": ["chill", "relax", "santai", "tenang"],
    "romance": ["romance", "romantis", "love", "cinta"],
    "fokus": ["focus", "fokus", "konsentrasi", "study", "belajar"],
    "party": ["party", "pesta", "dance"],
}
MOOD_QUERY = {
    "feelgood": "feel good hits",
    "sad": "sad songs",
    "energi": "workout energy music",
    "chill": "chill relax music",
    "romance": "romantic love songs",
    "fokus": "focus music",
    "party": "party music",
}


def _mood_tracks(yt, mood: str) -> List[dict]:
    """Lagu asli dari kategori mood YT Music; fallback ke pencarian playlist."""
    keywords = MOOD_KEYWORDS.get(mood, [mood])
    playlist_id = None
    try:
        cats = yt.get_mood_categories() or {}
        for group in cats.values():
            for c in group:
                t = (c.get("title") or "").lower()
                if any(k in t for k in keywords):
                    pls = yt.get_mood_playlists(c["params"]) or []
                    pls = [p for p in pls if p.get("playlistId")]
                    if pls:
                        playlist_id = pls[0]["playlistId"]
                        break
            if playlist_id:
                break
    except Exception as e:
        log.warning("mood categories gagal (%s): %s", mood, e)

    if not playlist_id:
        res = yt.search(MOOD_QUERY.get(mood, f"{mood} music"), filter="playlists", limit=3) or []
        for r in res:
            pid = r.get("browseId")
            if pid:
                playlist_id = pid[2:] if pid.startswith("VL") else pid
                break

    if playlist_id:
        pl = yt.get_playlist(playlist_id, limit=30)
        tracks = [norm_song(t) for t in pl.get("tracks", [])]
        tracks = [t for t in tracks if t]
        if tracks:
            return tracks
    res = yt.search(MOOD_QUERY.get(mood, f"{mood} music"), filter="songs", limit=20) or []
    return [s for s in (norm_song(r) for r in res) if s]


MOODS = [
    {"id": "feelgood", "name": "Bersemangat", "color": "#fbbf24"},
    {"id": "sad", "name": "Sedih", "color": "#60a5fa"},
    {"id": "energi", "name": "Olah Raga", "color": "#f97316"},
    {"id": "chill", "name": "Bersantai", "color": "#10b981"},
    {"id": "romance", "name": "Romantis", "color": "#f472b6"},
    {"id": "fokus", "name": "Fokus", "color": "#a855f7"},
    {"id": "party", "name": "Pesta", "color": "#ec4899"},
]


@app.get("/")
def root():
    return {"status": "online", "name": "Liquid Music API", "source": "YouTube Music (live)", "location": LOCATION}


@app.get("/health")
def health():
    # "app" dipakai server.ts untuk memastikan yang menjawab benar-benar backend ini
    # (bukan Jupyter / server lain yang kebetulan memakai port yang sama).
    return {"app": "liquid-music", "ok": ytmusic is not None}


@app.get("/diag")
async def diag():
    """Cek tiap sumber data; buka /music-api/diag untuk melihat mana yang gagal."""
    report: Dict[str, Any] = {"ytmusicapi": ytmusic is not None, "location": LOCATION}
    try:
        import ytmusicapi
        report["version"] = getattr(ytmusicapi, "__version__", "?")
    except Exception as e:
        report["version"] = f"error: {e!r}"
    if ytmusic is None:
        return report

    async def probe(name, fn):
        try:
            res = await run(fn)
            report[name] = f"ok ({len(res) if hasattr(res, '__len__') else 'ok'})"
        except Exception as e:
            report[name] = f"GAGAL: {e!r}"

    await probe("search", lambda: ytmusic.search("coldplay", filter="songs", limit=3))
    await probe("get_home", lambda: ytmusic.get_home(limit=2))
    await probe("get_charts", lambda: ytmusic.get_charts(CHART_COUNTRY))
    await probe("get_mood_categories", lambda: ytmusic.get_mood_categories())
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get("https://lrclib.net/api/get", params={"track_name": "Yellow", "artist_name": "Coldplay"})
            report["lrclib"] = f"ok ({r.status_code})"
    except Exception as e:
        report["lrclib"] = f"GAGAL: {e!r}"
    return report


@app.get("/home")
async def home(genre: Optional[str] = Query(None)):
    yt = need_yt()
    mood = (genre or "semua").lower()

    async def produce():
        home_task = run(_collect_home, yt)
        charts_task = run(_collect_charts, yt)
        mood_task = run(_mood_tracks, yt, mood) if mood in MOOD_KEYWORDS else None

        h, c = await asyncio.gather(home_task, charts_task, return_exceptions=True)
        if isinstance(h, Exception):
            log.warning("get_home gagal: %r", h)
        if isinstance(c, Exception):
            log.warning("charts gagal: %r", c)
        h = h if isinstance(h, dict) else {"quick": [], "extra": [], "albums": [], "artists": []}
        c = c if isinstance(c, dict) else {"songs": [], "artists": [], "albums": []}

        # Cadangan (tetap data asli YT Music): endpoint search paling stabil
        if not h["quick"] and not c["songs"]:
            log.info("get_home/get_charts kosong, pakai pencarian YouTube Music sebagai sumber")
            def search_fallback():
                out = {"songs": [], "albums": [], "artists": []}
                try:
                    out["songs"] = [s for s in (norm_song(r) for r in yt.search("top hits", filter="songs", limit=25)) if s]
                except Exception as e:
                    log.warning("search songs gagal: %r", e)
                try:
                    out["albums"] = [a for a in (norm_album(r) for r in yt.search("new albums", filter="albums", limit=10)) if a]
                except Exception as e:
                    log.warning("search albums gagal: %r", e)
                try:
                    out["artists"] = [a for a in (norm_artist(r) for r in yt.search("top artists", filter="artists", limit=12)) if a]
                except Exception as e:
                    log.warning("search artists gagal: %r", e)
                return out
            fb = await run(search_fallback)
            c = {"songs": fb["songs"], "albums": fb["albums"], "artists": fb["artists"]}
            if not c["songs"] and mood not in MOOD_KEYWORDS:
                raise RuntimeError("YouTube Music tidak mengembalikan data (cek koneksi internet server / versi ytmusicapi)")

        if mood in MOOD_KEYWORDS:
            quick = await mood_task
            charts = c["songs"] or h["extra"]
        elif mood == "trending":
            quick = c["songs"][:16] or h["quick"]
            charts = c["songs"] or h["extra"]
        else:
            quick = h["quick"] or c["songs"][:16]
            charts = c["songs"] or h["extra"]

        albums = dedupe(c["albums"] + h["albums"])[:10]
        artists = dedupe(c["artists"] + h["artists"])[:12]
        return {
            "status": "success",
            "updatedAt": int(time.time()),
            "location": LOCATION,
            "chartCountry": CHART_COUNTRY,
            "moods": MOODS,
            "quickPicks": quick[:16],
            "charts": charts[:20],
            "featuredAlbums": albums,
            "trendingArtists": artists,
        }

    try:
        return await cached(f"home:{mood}", TTL_HOME if mood == "semua" else TTL_MOOD, produce)
    except HTTPException:
        raise
    except Exception as e:
        log.error("home gagal: %s", e)
        raise HTTPException(503, f"Gagal mengambil data YouTube Music: {e}")


def norm_search_item(r: dict) -> Optional[dict]:
    kind = r.get("resultType")
    if kind in ("song", "video"):
        item = norm_song(r)
    elif kind == "album":
        item = norm_album(r)
    elif kind == "artist":
        item = norm_artist(r)
    else:
        return None
    if item:
        item["kind"] = kind
    return item


@app.get("/search")
async def search(q: str = Query(...), filter: Optional[str] = Query(None)):
    yt = need_yt()
    q = q.strip()
    if not q:
        return {"status": "success", "query": q, "results": []}
    yt_filter = filter if filter in ("songs", "albums", "artists", "videos") else None

    async def produce():
        raw = await run(lambda: yt.search(q, filter=yt_filter, limit=25))
        return dedupe([i for i in (norm_search_item(r) for r in raw) if i])

    try:
        results = await cached(f"search:{yt_filter}:{q.lower()}", TTL_SEARCH, produce)
    except Exception as e:
        raise HTTPException(503, f"Pencarian gagal: {e}")
    return {"status": "success", "query": q, "filter": yt_filter, "results": results}


@app.get("/suggest")
async def suggest(q: str = Query(...)):
    yt = need_yt()
    try:
        items = await cached(f"suggest:{q.lower()}", TTL_SEARCH, lambda: run(yt.get_search_suggestions, q))
    except Exception:
        items = []
    return {"status": "success", "suggestions": items[:8]}


# --------------------------------------------------------------------------- #
# Album, artis, lagu
# --------------------------------------------------------------------------- #
@app.get("/album/{browse_id}")
async def album(browse_id: str):
    yt = need_yt()

    async def produce():
        a = await run(yt.get_album, browse_id)
        thumb = best_thumb(a.get("thumbnails"))
        al = {"name": a.get("title"), "id": browse_id}
        tracks = [norm_song(t, fallback_thumb=thumb, fallback_album=al) for t in a.get("tracks", [])]
        tracks = [t for t in tracks if t]
        artists = ", ".join(x["name"] for x in a.get("artists", []) if x.get("name"))
        return {
            "id": browse_id,
            "title": a.get("title"),
            "artist": artists,
            "year": str(a.get("year") or ""),
            "thumbnail": thumb,
            "tracksCount": len(tracks),
            "description": a.get("description") or "",
            "tracks": tracks,
        }

    try:
        return {"status": "success", "album": await cached(f"album:{browse_id}", TTL_META, produce)}
    except Exception as e:
        raise HTTPException(503, f"Album gagal dimuat: {e}")


@app.get("/artist/{channel_id}")
async def artist(channel_id: str):
    yt = need_yt()

    async def produce():
        a = await run(yt.get_artist, channel_id)
        songs_sec = a.get("songs") or {}
        songs = [norm_song(s) for s in songs_sec.get("results", [])]
        songs = [s for s in songs if s]
        # lengkapi daftar lagu populer lewat playlist artis bila tersedia
        if len(songs) < 5 and songs_sec.get("browseId"):
            try:
                pl = await run(yt.get_playlist, songs_sec["browseId"], 25)
                songs = dedupe(songs + [s for s in (norm_song(t) for t in pl.get("tracks", [])) if s])
            except Exception:
                pass
        return {
            "artist": {
                "id": channel_id,
                "name": a.get("name"),
                "subscribers": a.get("subscribers") or "",
                "thumbnail": best_thumb(a.get("thumbnails")),
                "bio": a.get("description") or "",
            },
            "songs": songs,
        }

    try:
        data = await cached(f"artist:{channel_id}", TTL_META, produce)
        return {"status": "success", **data}
    except Exception as e:
        raise HTTPException(503, f"Artis gagal dimuat: {e}")


@app.get("/song/{video_id}")
async def song(video_id: str):
    yt = need_yt()

    async def produce():
        w = await run(lambda: yt.get_watch_playlist(videoId=video_id, limit=1))
        tr = (w.get("tracks") or [{}])[0]
        s = norm_song({**tr, "videoId": video_id})
        if not s:
            raise RuntimeError("lagu tidak ditemukan")
        return s

    try:
        return await cached(f"song:{video_id}", TTL_META, produce)
    except Exception as e:
        raise HTTPException(503, f"Lagu gagal dimuat: {e}")


@app.get("/related/{video_id}")
async def related(video_id: str):
    """Antrean otomatis ala radio YT Music."""
    yt = need_yt()

    async def produce():
        w = await run(lambda: yt.get_watch_playlist(videoId=video_id, radio=True, limit=25))
        return [s for s in (norm_song(t) for t in w.get("tracks", [])) if s]

    try:
        return {"status": "success", "results": await cached(f"related:{video_id}", TTL_HOME, produce)}
    except Exception as e:
        raise HTTPException(503, f"Radio gagal dimuat: {e}")


# --------------------------------------------------------------------------- #
# Lirik tersinkron (YT Music timestamps -> LRCLIB -> teks biasa)
# --------------------------------------------------------------------------- #
LRC_TS = re.compile(r"\[(\d+):(\d{1,2}(?:[.:]\d{1,3})?)\]")


def parse_lrc(lrc: str) -> List[dict]:
    lines: List[dict] = []
    for raw in lrc.splitlines():
        stamps = LRC_TS.findall(raw)
        if not stamps:
            continue
        text = LRC_TS.sub("", raw).strip()
        for mm, ss in stamps:
            t = int(mm) * 60 + float(ss.replace(":", "."))
            lines.append({"time": round(t, 2), "text": text})
    lines.sort(key=lambda x: x["time"])
    # gabungkan jeda kosong berurutan
    out: List[dict] = []
    for ln in lines:
        if not ln["text"] and out and not out[-1]["text"]:
            continue
        out.append(ln)
    return out


def clean_title(t: str) -> str:
    t = re.sub(r"[\(\[].*?[\)\]]", "", t or "")
    t = re.sub(r"\s+-\s+(remaster|live|radio|single|version).*$", "", t, flags=re.I)
    return t.strip()


def _ytm_timed(yt, browse_id: str) -> Tuple[List[dict], str]:
    try:
        res = yt.get_lyrics(browse_id, timestamps=True)
    except TypeError:  # ytmusicapi lama tanpa timestamps
        res = yt.get_lyrics(browse_id)
    if not res:
        return [], ""
    data = res.get("lyrics") if isinstance(res, dict) else getattr(res, "lyrics", None)
    has_ts = res.get("hasTimestamps") if isinstance(res, dict) else getattr(res, "hasTimestamps", False)
    if isinstance(data, str):
        return [], data
    synced = []
    if has_ts and data:
        for ln in data:
            if isinstance(ln, dict):
                text, start = ln.get("text"), ln.get("start_time")
            else:
                text, start = getattr(ln, "text", None), getattr(ln, "start_time", None)
            if text is None or start is None:
                continue
            synced.append({"time": round(start / 1000.0, 2), "text": text.strip()})
        synced.sort(key=lambda x: x["time"])
    plain = "\n".join(l["text"] for l in synced)
    return synced, plain


async def _lrclib(title: str, artist: str, album: Optional[str], duration: Optional[int]) -> Tuple[List[dict], str]:
    headers = {"User-Agent": "LiquidMusic/3.0 (https://github.com/)"}
    async with httpx.AsyncClient(timeout=8, headers=headers) as client:
        params = {"track_name": title, "artist_name": artist}
        if album:
            params["album_name"] = album
        if duration:
            params["duration"] = duration
        data = None
        try:
            r = await client.get("https://lrclib.net/api/get", params=params)
            if r.status_code == 200:
                data = r.json()
        except Exception as e:
            log.info("lrclib get gagal: %s", e)
        if not data or not (data.get("syncedLyrics") or data.get("plainLyrics")):
            try:
                r = await client.get("https://lrclib.net/api/search", params={"track_name": title, "artist_name": artist})
                cands = r.json() if r.status_code == 200 else []
                if duration:
                    cands = [c for c in cands if c.get("duration") and abs(c["duration"] - duration) <= 6] or cands
                cands.sort(key=lambda c: 0 if c.get("syncedLyrics") else 1)
                data = cands[0] if cands else None
            except Exception as e:
                log.info("lrclib search gagal: %s", e)
    if not data:
        return [], ""
    synced = parse_lrc(data["syncedLyrics"]) if data.get("syncedLyrics") else []
    return synced, data.get("plainLyrics") or ""


@app.get("/lyrics/{video_id}")
async def lyrics(video_id: str):
    yt = need_yt()

    async def produce():
        w = await run(lambda: yt.get_watch_playlist(videoId=video_id, limit=1))
        tr = (w.get("tracks") or [{}])[0]
        browse_id = w.get("lyrics")
        title = clean_title(tr.get("title", ""))
        artist = (tr.get("artists") or [{}])[0].get("name", "")
        album = (tr.get("album") or {}).get("name") if isinstance(tr.get("album"), dict) else None
        duration = to_seconds(tr.get("length"))

        synced: List[dict] = []
        plain, source = "", ""

        if browse_id:
            try:
                synced, plain = await run(_ytm_timed, yt, browse_id)
                if synced:
                    source = "YouTube Music"
            except Exception as e:
                log.info("lirik YTM gagal: %s", e)

        if not synced and title and artist:
            try:
                l_synced, l_plain = await _lrclib(title, artist, album, duration)
                if l_synced:
                    synced, source = l_synced, "LRCLIB"
                if not plain and l_plain:
                    plain = l_plain
                    source = source or "LRCLIB"
            except Exception as e:
                log.info("lirik LRCLIB gagal: %s", e)

        return {
            "status": "success",
            "videoId": video_id,
            "isSynced": bool(synced),
            "plainLyrics": plain,
            "syncedLyrics": synced,
            "source": source,
        }

    try:
        return await cached(f"lyrics:{video_id}", TTL_LYRICS, produce)
    except Exception as e:
        log.warning("lirik gagal %s: %s", video_id, e)
        return {"status": "success", "videoId": video_id, "isSynced": False,
                "plainLyrics": "", "syncedLyrics": [], "source": ""}


# --------------------------------------------------------------------------- #
# Stream audio langsung (opsional, via yt-dlp). Pemutar utama memakai YouTube IFrame.
# --------------------------------------------------------------------------- #
@app.get("/stream/{video_id}")
async def stream(video_id: str):
    if not re.fullmatch(r"[\w-]{11}", video_id):
        raise HTTPException(400, "videoId tidak valid")

    async def produce():
        import yt_dlp

        def extract():
            opts = {"format": "bestaudio/best", "quiet": True, "no_warnings": True, "skip_download": True}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://music.youtube.com/watch?v={video_id}", download=False)
                return info["url"]

        return await run(extract)

    try:
        url = await cached(f"stream:{video_id}", TTL_STREAM, produce)
    except Exception as e:
        raise HTTPException(503, f"Gagal mengambil stream: {e}")
    return RedirectResponse(url, status_code=307)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8765)), reload=False)
