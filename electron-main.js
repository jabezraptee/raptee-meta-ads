const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

let mainWindow = null;
let pythonProcess = null;
let serverPort = 8000;

// Determine paths based on environment (development vs packaged)
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : __dirname;

function getPythonExecutable() {
  if (isPackaged) {
    const bundledPython = path.join(resourcesPath, 'python_dist', 'python.exe');
    if (fs.existsSync(bundledPython)) return bundledPython;
  }

  // Development fallbacks: check .venv first, then system python
  const venvPython = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) return venvPython;

  return 'python';
}

function getAppDirectory() {
  if (isPackaged) {
    return path.join(resourcesPath, 'app_backend');
  }
  return __dirname;
}

function getBrowsersPath() {
  if (isPackaged) {
    const bundledBrowsers = path.join(resourcesPath, 'python_dist', 'browsers');
    if (fs.existsSync(bundledBrowsers)) return bundledBrowsers;
  }
  const devBrowsers = path.join(__dirname, 'python_dist', 'browsers');
  if (fs.existsSync(devBrowsers)) return devBrowsers;
  return null;
}

// Check if a port is in use and find an available one if needed
function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      server.once('close', () => resolve(startPort));
      server.close();
    });
    server.on('error', () => {
      // Port in use, try next one
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

function startBackend(port) {
  const pythonExe = getPythonExecutable();
  const appDir = getAppDirectory();
  const mainScript = path.join(appDir, 'main.py');
  const browsersPath = getBrowsersPath();

  console.log(`[Electron] Launching backend using: ${pythonExe}`);
  console.log(`[Electron] Working directory: ${appDir}`);
  console.log(`[Electron] Script: ${mainScript}`);

  const env = {
    ...process.env,
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: String(port),
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };

  if (browsersPath) {
    env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    console.log(`[Electron] PLAYWRIGHT_BROWSERS_PATH set to: ${browsersPath}`);
  }

  pythonProcess = spawn(pythonExe, ['-s', mainScript], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python stdout]: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python stderr]: ${data.toString().trim()}`);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.log(`[Python] Process exited with code ${code}, signal ${signal}`);
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        'Backend Service Terminated',
        `The background Python server exited unexpectedly (code ${code}).\n\nPlease ensure your configuration and dependencies are intact.`
      );
    }
  });

  pythonProcess.on('error', (err) => {
    console.error(`[Python Spawn Error]:`, err);
    dialog.showErrorBox(
      'Failed to Start Backend',
      `Unable to start Python runtime:\n${err.message}\nPath: ${pythonExe}`
    );
  });
}

function waitForServer(port, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const statusUrl = `http://127.0.0.1:${port}/api/status`;

    const poll = () => {
      const req = http.get(statusUrl, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', () => {
        retry();
      });

      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error(`Timed out waiting for backend on port ${port}`));
      } else {
        setTimeout(poll, 400);
      }
    };

    poll();
  });
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Meta Ads Intelligence Platform',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function stopBackend() {
  if (pythonProcess && pythonProcess.pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pythonProcess.pid} /f /t`, { stdio: 'ignore' });
      } else {
        pythonProcess.kill('SIGTERM');
      }
    } catch (_) {
      // Ignore if process already exited
    }
    pythonProcess = null;
  }
}

// App lifecycle
app.isQuitting = false;

app.whenReady().then(async () => {
  try {
    serverPort = await findAvailablePort(8000);
    console.log(`[Electron] Using server port: ${serverPort}`);

    startBackend(serverPort);
    await waitForServer(serverPort);
    createMainWindow(serverPort);
  } catch (err) {
    console.error('[Electron Startup Error]:', err);
    dialog.showErrorBox(
      'Application Initialization Error',
      `The Meta Ads application could not connect to its local server:\n${err.message}`
    );
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
