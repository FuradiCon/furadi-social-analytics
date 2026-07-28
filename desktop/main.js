const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// This widget reads the *live* docs/data.json from the dashboard repo
// checkout on disk, so it always reflects whatever the Python pipeline last
// generated -- same source of truth as the GitHub Pages dashboard, no
// separate bundled copy to keep in sync. Personal, single-machine tool, so a
// hardcoded local path is fine.
const DOCS_DIR = 'D:\\BOT Guide\\Furadi Social Analytics\\docs';
const WIDGET_DIR = __dirname;
const PORT = 4174;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return { alwaysOnTop: false, panelOpacity: 0.2, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
  } catch {
    return { alwaysOnTop: false, panelOpacity: 0.2 };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings));
}

let settings = loadSettings();

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serveFrom(root, urlPath, res) {
  const resolvedRoot = path.resolve(root);
  const filePath = path.join(resolvedRoot, urlPath);
  if (!filePath.startsWith(resolvedRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath.startsWith('/docs/')) {
        serveFrom(DOCS_DIR, urlPath.slice('/docs'.length), res);
      } else {
        serveFrom(WIDGET_DIR, urlPath === '/' ? '/widget.html' : urlPath, res);
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

let win;

async function createWindow() {
  await startServer();

  win = new BrowserWindow({
    width: 320,
    height: 560,
    frame: false,
    resizable: true,
    transparent: true,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, 'icon.ico'),
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Windows can silently drop a window out of the topmost Z-band -- after
  // certain focus changes, notification toasts, or another app briefly
  // grabbing topmost itself -- without ever telling Electron the flag
  // changed. Calling setAlwaysOnTop(true) again while Electron still
  // *thinks* it's already topmost can be a no-op (Windows sees "no change
  // requested" and skips the actual Z-restack) -- toggling off then back on
  // forces a real SetWindowPos(HWND_TOPMOST) instead of being silently
  // swallowed. moveTop() is added on top of that in case another topmost
  // window (a notification toast, etc.) still sits above ours within the
  // topmost band itself.
  function reassertAlwaysOnTop() {
    if (!settings.alwaysOnTop || !win || win.isDestroyed()) return;
    win.setAlwaysOnTop(false);
    win.setAlwaysOnTop(true);
    win.moveTop();
  }
  win.on('blur', reassertAlwaysOnTop);
  setInterval(reassertAlwaysOnTop, 5000);

  // Defense in depth: nothing in widget.js calls window.open() today (the
  // account buttons go through the IPC channel below instead), but if a
  // future link ever does, send it to the real browser instead of spawning
  // a bare Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(`http://127.0.0.1:${PORT}/widget.html`);
}

ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

ipcMain.handle('get-always-on-top', () => settings.alwaysOnTop);

ipcMain.on('set-always-on-top', (_event, value) => {
  settings.alwaysOnTop = !!value;
  saveSettings(settings);
  if (win) win.setAlwaysOnTop(settings.alwaysOnTop);
});

ipcMain.handle('get-panel-opacity', () => settings.panelOpacity);

ipcMain.on('set-panel-opacity', (_event, value) => {
  settings.panelOpacity = Math.min(1, Math.max(0.15, Number(value) || 0.2));
  saveSettings(settings);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
