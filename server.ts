import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';
import { fileURLToPath } from 'url';
import { spawn, spawnSync, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PREFERRED_API_PORT = Number(process.env.BACKEND_PORT || 8765); // BUKAN 8888 (default Jupyter)
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(express.json());

// ---------------------------------------------------------------------------
// Python FastAPI backend: cari port bebas, install dependency, start, auto-restart
// ---------------------------------------------------------------------------
const backendDir = path.join(__dirname, 'backend');
let apiPort = PREFERRED_API_PORT;
let backendReady = false;
let backendError = 'Backend sedang dimulai...';
let fastApiProcess: ChildProcess | null = null;
let stopping = false;
let restarts = 0;

function findPython(): string | null {
  for (const bin of ['python3', 'python', 'py']) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickPort(start: number): Promise<number> {
  for (let p = start; p < start + 50; p++) if (await isPortFree(p)) return p;
  return start;
}

function ensureDeps(py: string) {
  const check = spawnSync(py, ['-c', 'import fastapi, uvicorn, ytmusicapi, httpx, yt_dlp'], { encoding: 'utf8' });
  if (check.status === 0) return;
  console.log('[backend] Menginstal dependency Python (sekali saja)...');
  const req = path.join(backendDir, 'requirements.txt');
  const a = spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--upgrade', '--break-system-packages', '-r', req], { stdio: 'inherit' });
  if (a.status !== 0) spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--upgrade', '-r', req], { stdio: 'inherit' });
}

/** Pastikan yang menjawab di port itu memang backend kita (bukan Jupyter dll). */
function probeBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: apiPort, path: '/health', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body).app === 'liquid-music'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function watchBackend() {
  for (;;) {
    const ok = await probeBackend();
    if (ok && !backendReady) console.log(`[backend] siap di 127.0.0.1:${apiPort}`);
    backendReady = ok;
    if (ok) backendError = '';
    await new Promise((r) => setTimeout(r, ok ? 5000 : 800));
  }
}

function startBackend(py: string) {
  fastApiProcess = spawn(py, [path.join(backendDir, 'main.py')], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: `${apiPort}`, PYTHONUNBUFFERED: '1' },
  });
  fastApiProcess.on('error', (err) => { backendError = `Gagal start backend: ${err.message}`; console.error('[backend]', backendError); });
  fastApiProcess.on('exit', (code) => {
    backendReady = false;
    if (stopping) return;
    backendError = `Backend berhenti (kode ${code}).`;
    console.error(`[backend] ${backendError}`);
    if (restarts++ < 5) setTimeout(() => startBackend(py), 1500);
  });
}

async function bootBackend() {
  const py = findPython();
  if (!py) {
    backendError = 'Python tidak ditemukan. Install Python 3.9+ lalu jalankan ulang.';
    console.error('[backend]', backendError);
    return;
  }
  try {
    apiPort = await pickPort(PREFERRED_API_PORT);
    if (apiPort !== PREFERRED_API_PORT) console.log(`[backend] port ${PREFERRED_API_PORT} dipakai, pindah ke ${apiPort}`);
    ensureDeps(py);
    startBackend(py);
    watchBackend();
  } catch (err: any) {
    backendError = `Tidak bisa menjalankan FastAPI: ${err?.message || err}`;
    console.error('[backend]', backendError);
  }
}

const shutdown = () => { stopping = true; fastApiProcess?.kill(); };
process.on('exit', shutdown);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ---------------------------------------------------------------------------
// Proxy: /music-api/* dan /api/*  ->  FastAPI (Range/redirect aman untuk audio)
// ---------------------------------------------------------------------------
app.get(['/music-api/_status', '/api/_status'], (_req, res) => {
  res.json({ ok: backendReady, port: apiPort, error: backendError });
});

app.use(['/music-api', '/api'], (req: Request, res: Response) => {
  if (!backendReady) {
    // 503 (bukan 404) + pesan jelas; klien akan mencoba lagi otomatis.
    res.status(503).json({ status: 'error', detail: `Backend belum siap. ${backendError}`.trim() });
    return;
  }
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: apiPort,
      path: req.url, // sudah tanpa prefix mount
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
      timeout: 45000,
    },
    (proxyRes) => {
      const status = proxyRes.statusCode || 502;
      if (status >= 300 && status < 400 && proxyRes.headers.location) {
        res.redirect(status, proxyRes.headers.location);
        proxyRes.resume();
        return;
      }
      res.writeHead(status, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('timeout', () => proxyReq.destroy(new Error('timeout')));
  proxyReq.on('error', (err) => {
    if (res.headersSent) { res.end(); return; }
    res.status(503).json({ status: 'error', detail: `Backend tidak merespons (${err.message}).` });
  });
  if (req.method === 'GET' || req.method === 'HEAD') proxyReq.end();
  else req.pipe(proxyReq);
});

// Endpoint API yang tidak dikenal -> JSON 404 yang jelas (bukan halaman HTML)
async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('[server] folder dist/ belum ada. Jalankan "npm run build" dulu.');
    }
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Auralys running on http://0.0.0.0:${PORT}`);
  });
}

bootBackend();
startServer();
