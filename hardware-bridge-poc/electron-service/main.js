const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { start, PORT } = require('./server');

let win;

function createWindow() {
  win = new BrowserWindow({ width: 480, height: 460, resizable: false });
  win.loadFile(path.join(__dirname, 'status.html'));
  win.webContents.on('did-finish-load', () =>
    win.webContents.executeJavaScript(`window.__PORT__ = ${PORT}`)
  );
  win.webContents.on('will-navigate', (e, url) => {
    // Keep external links inside the OS browser, not the Electron window.
    e.preventDefault();
    shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  start();
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Service-style: stay resident on macOS, quit elsewhere.
  if (process.platform !== 'darwin') app.quit();
});