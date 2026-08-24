const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

// The hosted web app. All features (rename, ZIP, Google Drive upload) work here.
const APP_URL = "https://page-renamer-pro.vercel.app/";

let win = null;

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

  const loadApp = () => win.loadURL(APP_URL);
  loadApp();

  // Offline / load failure -> friendly local page with a retry button.
  win.webContents.on("did-fail-load", (_e, _code, _desc, url, isMainFrame) => {
    if (isMainFrame) win.loadFile(path.join(__dirname, "offline.html"));
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
