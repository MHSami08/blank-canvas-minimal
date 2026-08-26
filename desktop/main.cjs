const { app, BrowserWindow, shell, Menu, net } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Hosted web app (used when the PC is online) and the bundled offline copy.
const APP_URL = "https://page-renamer-pro.vercel.app/";
const APP_DIR = path.join(__dirname, "app");

let win = null;
let localUrl = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

// Tiny static server for the bundled site (needed so the app runs on a real origin).
function startLocalServer() {
  if (localUrl) return Promise.resolve(localUrl);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(APP_DIR, urlPath);
      if (!file.startsWith(APP_DIR)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, "index.html");
      }
      if (!fs.existsSync(file)) {
        // SPA fallback
        file = path.join(APP_DIR, "index.html");
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      localUrl = `http://127.0.0.1:${server.address().port}/`;
      resolve(localUrl);
    });
  });
}

function isOnline(timeoutMs = 3500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    setTimeout(() => finish(false), timeoutMs);
    try {
      const request = net.request({ method: "HEAD", url: APP_URL });
      request.on("response", (r) => finish(r.statusCode < 500));
      request.on("error", () => finish(false));
      request.end();
    } catch {
      finish(false);
    }
  });
}

async function loadOffline() {
  const url = await startLocalServer();
  win.loadURL(url);
}

async function loadApp() {
  if (await isOnline()) {
    win.loadURL(APP_URL);
  } else {
    loadOffline();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: "#070b18",
    autoHideMenuBar: true,
    title: "Page Renamer Pro",
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  loadApp();

  // If the live site fails to load for any reason, fall back to the offline copy.
  win.webContents.on("did-fail-load", (_e, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame && (!localUrl || !win.webContents.getURL().startsWith("http://127.0.0.1"))) {
      loadOffline();
    }
  });

  // Google / Clerk sign-in popups open in a real window instead of being blocked.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/accounts\.google\.com|clerk\.|wa\.me|whatsapp\.com/.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 520,
        height: 700,
        autoHideMenuBar: true,
      },
    };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
