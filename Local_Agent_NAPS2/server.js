// ============================================================================
// Local Scanner Agent for Maptech DMS
// Bridges local NAPS2 scanner hardware with the cloud backend on Railway
// ============================================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

loadEnvironment();

const app = express();
const PORT = toInteger(process.env.PORT, 3001);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const APP_ROOT = getAppRoot();
const SCANS_DIR = path.resolve(APP_ROOT, process.env.SCANS_DIR || 'scans');
const BIN_DIR = path.resolve(APP_ROOT, 'bin');
const SCAN_TIMEOUT = toInteger(process.env.SCAN_TIMEOUT, 300000); // 5 min default
const NAPS2_NAMES = ['naps2.console.exe', 'NAPS2.Console.exe'];

ensureDirectory(SCANS_DIR);
ensureDirectory(BIN_DIR);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(cors({
  origin: true,            // allow any origin (local agent is trusted)
  credentials: true,
}));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---------------------------------------------------------------------------
// Helper: locate NAPS2
// ---------------------------------------------------------------------------

function findNaps2() {
  const configuredPath = resolveConfiguredNaps2Path(process.env.NAPS2_PATH);
  if (configuredPath) return configuredPath;

  const bundledPath = resolveBundledNaps2();
  if (bundledPath) return bundledPath;

  const localCandidates = [];
  for (const fileName of NAPS2_NAMES) {
    localCandidates.push(path.join(APP_ROOT, fileName));
    localCandidates.push(path.join(BIN_DIR, fileName));
    localCandidates.push(path.join(__dirname, fileName));
  }

  const candidates = [
    ...localCandidates,
    ...resolveExecutableFromPath(),
    'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
    'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NAPS2', 'NAPS2.Console.exe'),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: run a shell command as a promise
// ---------------------------------------------------------------------------

function run(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = { timeout: SCAN_TIMEOUT, encoding: 'utf8', ...options };
    exec(cmd, opts, (error, stdout, stderr) => {
      if (error) return reject({ error, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: clean up a temp file (best-effort)
// ---------------------------------------------------------------------------

function cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`[cleanup] Failed to delete ${filePath}:`, err.message);
  }
}

function loadEnvironment() {
  const envCandidates = [
    path.join(getAppRoot(), '.env'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
  ];

  for (const envPath of [...new Set(envCandidates)]) {
    if (!envPath || !fs.existsSync(envPath)) continue;

    dotenv.config({ path: envPath, override: false });
    console.log(`[config] Loaded environment from ${envPath}`);
    return;
  }

  dotenv.config();
}

function getAppRoot() {
  return process.pkg ? path.dirname(process.execPath) : __dirname;
}

function toInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveConfiguredNaps2Path(configuredPath) {
  if (!configuredPath) return null;

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(APP_ROOT, configuredPath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function resolveExecutableFromPath() {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const matches = [];

  for (const entry of pathEntries) {
    for (const fileName of NAPS2_NAMES) {
      matches.push(path.join(entry, fileName));
    }
  }

  return matches;
}

function resolveBundledNaps2() {
  for (const fileName of NAPS2_NAMES) {
    const assetPath = path.join(__dirname, fileName);
    if (!fs.existsSync(assetPath)) continue;

    if (!process.pkg) {
      return assetPath;
    }

    const extractedPath = path.join(BIN_DIR, fileName);

    try {
      if (!fs.existsSync(extractedPath)) {
        fs.copyFileSync(assetPath, extractedPath);
      }

      return extractedPath;
    } catch (err) {
      console.error(`[config] Failed to extract bundled NAPS2 executable: ${err.message}`);
    }
  }

  return null;
}

function requireAuthorization(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing token' });
    return null;
  }

  return authHeader;
}

function getFolderId(payload) {
  return payload.folder_id ?? payload.folderId;
}

function uploadDocumentToBackend({ authHeader, filePath, title, folderId, departmentId, description }) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const form = new FormData();

  form.append('file', fs.createReadStream(filePath), {
    filename: `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`,
    contentType: ext === 'pdf' ? 'application/pdf' : `image/${ext}`,
  });
  form.append('title', title);
  form.append('folder_id', String(folderId));
  if (departmentId) form.append('department_id', String(departmentId));
  if (description) form.append('description', description);

  // The agent never stores the JWT. It forwards the incoming Authorization
  // header unchanged to the cloud backend for this single request.
  return axios.post(`${BACKEND_URL}/api/documents/`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: authHeader,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000,
  });
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  const naps2 = findNaps2();
  res.json({
    status: 'ok',
    packaged: !!process.pkg,
    naps2Installed: !!naps2,
    naps2Path: naps2 || 'NOT FOUND',
    backendUrl: BACKEND_URL,
    scansDir: SCANS_DIR,
    appRoot: APP_ROOT,
  });
});

// ---------------------------------------------------------------------------
// GET /scanners — list available scanner devices via NAPS2
// ---------------------------------------------------------------------------

app.get('/scanners', async (_req, res) => {
  const naps2 = findNaps2();
  if (!naps2) {
    return res.status(500).json({
      error: 'NAPS2 not found',
      message: 'Install NAPS2 from https://www.naps2.com/ or set NAPS2_PATH in .env',
    });
  }

  try {
    // Query WIA and ESCL drivers in parallel
    const results = await Promise.allSettled([
      run(`"${naps2}" --listdevices --driver wia`),
      run(`"${naps2}" --listdevices --driver escl`),
    ]);

    const scanners = [];

    // Parse WIA devices
    if (results[0].status === 'fulfilled') {
      const lines = results[0].value.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const name of lines) {
        scanners.push({ name, driver: 'wia', connection: 'usb' });
      }
    }

    // Parse ESCL (network) devices
    if (results[1].status === 'fulfilled') {
      const lines = results[1].value.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const name of lines) {
        // Avoid duplicates
        if (!scanners.some(s => s.name === name)) {
          scanners.push({ name, driver: 'escl', connection: 'network' });
        }
      }
    }

    console.log(`[scanners] Found ${scanners.length} device(s)`);
    res.json({ scanners });
  } catch (err) {
    console.error('[scanners] Error:', err);
    res.status(500).json({ error: 'Failed to list scanners', details: err.stderr || err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /scan — execute a scan and upload to the cloud backend
//
// Body:
//   Authorization header: Bearer <jwt> (REQUIRED)
//   title       (string, REQUIRED) — document title
//   folder_id   (string | number, REQUIRED) — target folder ID
//   scannerName | scanner (string, optional) — specific scanner device name
//   driver      (string, optional) — "wia" | "escl" (default: "wia")
//   format      (string, optional) — "pdf" | "png" | "jpg" (default: "pdf")
//   dpi         (number, optional) — 150 | 200 | 300 | 600 (default: 300)
//   colorMode | color (string, optional) — "color" | "gray" | "bw" (default: "color")
//   paperSize   (string, optional) — "letter" | "a4" | "legal" (default: "letter")
//   scanSource  (string, optional) — "auto" | "glass" | "feeder"
//   multiPage   (boolean, optional) — enable multi-page (forces PDF)
// ---------------------------------------------------------------------------

app.post('/scan', async (req, res) => {
  const authHeader = requireAuthorization(req, res);
  if (!authHeader) {
    return;
  }

  const naps2 = findNaps2();
  if (!naps2) {
    return res.status(500).json({
      error: 'NAPS2 not found',
      message: 'Install NAPS2 from https://www.naps2.com/ or set NAPS2_PATH in .env',
    });
  }

  const {
    title,
    folder_id,
    folderId,
    scannerName,
    scanner,
    driver = 'wia',
    format = 'pdf',
    dpi = 300,
    colorMode,
    color = 'color',
    paperSize = 'letter',
    scanSource,
    multiPage = false,
    departmentId,
    description,
  } = req.body;

  const resolvedFolderId = getFolderId({ folder_id, folderId });
  const resolvedScannerName = scannerName || scanner;
  const resolvedColorMode = colorMode || color;

  // Validation
  if (!title) return res.status(400).json({ error: 'Missing required field: title' });
  if (!resolvedFolderId) return res.status(400).json({ error: 'Missing required field: folder_id' });

  // Map color mode to NAPS2 bitdepth
  const bitdepthMap = { color: 'color', gray: 'gray', bw: 'bw' };
  const bitdepth = bitdepthMap[resolvedColorMode] || 'color';

  // Map paper size to NAPS2 pagesize
  const pagesizeMap = { letter: 'letter', a4: 'a4', legal: 'legal' };
  const pagesize = pagesizeMap[paperSize] || 'letter';

  // Determine output format — multiPage always forces PDF
  const effectiveFormat = multiPage ? 'pdf' : format;
  const ext = effectiveFormat === 'png' ? 'png' : effectiveFormat === 'jpg' ? 'jpg' : 'pdf';

  // Generate temp output path
  const sessionId = uuidv4();
  const outputFile = path.join(SCANS_DIR, `scan_${sessionId}.${ext}`);

  // Build NAPS2 command
  let cmd = `"${naps2}" -o "${outputFile}"`;
  cmd += ` --driver ${driver}`;

  if (resolvedScannerName) {
    cmd += ` --device "${resolvedScannerName}"`;
  }

  cmd += ` --dpi ${dpi}`;
  cmd += ` --bitdepth ${bitdepth}`;
  cmd += ` --pagesize ${pagesize}`;

  if (scanSource === 'feeder') {
    cmd += ' --source feeder';
  } else if (scanSource === 'glass') {
    cmd += ' --source glass';
  }

  if (ext === 'pdf') {
    cmd += ' --pdfcompat PDF_A_2B';
  }

  cmd += ' --force';

  console.log(`[scan] Session ${sessionId}`);
  console.log(`[scan] Command: ${cmd}`);

  try {
    // Execute the scan
    const startTime = Date.now();
    await run(cmd);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[scan] NAPS2 finished in ${elapsed}s`);

    // Verify the output file was created
    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({
        error: 'Scan completed but output file not found',
        sessionId,
      });
    }

    const stats = fs.statSync(outputFile);
    console.log(`[scan] Output: ${outputFile} (${(stats.size / 1024).toFixed(1)} KB)`);

    // Upload to cloud backend
    console.log(`[scan] Uploading to ${BACKEND_URL}/api/documents/ ...`);

    const uploadRes = await uploadDocumentToBackend({
      authHeader,
      filePath: outputFile,
      title,
      folderId: resolvedFolderId,
      departmentId,
      description,
    });

    console.log(`[scan] Upload successful — document ID: ${uploadRes.data?.document?.id || 'unknown'}`);

    // Cleanup temp file
    cleanup(outputFile);

    res.json({
      success: true,
      sessionId,
      message: 'Scan completed and uploaded successfully',
      document: uploadRes.data?.document || uploadRes.data,
    });

  } catch (err) {
    console.error('[scan] Error:', err.error?.message || err.message || err);

    // Cleanup on failure too
    cleanup(outputFile);

    // Distinguish between scan errors and upload errors
    if (err.stdout !== undefined) {
      // NAPS2 execution error
      return res.status(500).json({
        error: 'Scan failed',
        details: err.stderr || err.error?.message,
        sessionId,
      });
    }

    if (err.response) {
      // Forward backend auth and validation failures so the frontend can handle re-login.
      return res.status(err.response.status).json({
        error: 'Upload to cloud backend failed',
        status: err.response.status,
        details: err.response.data,
        sessionId,
      });
    }

    // Network or other error
    res.status(500).json({
      error: 'Scan or upload failed',
      details: err.message,
      sessionId,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /scan-local — scan only, return file path (no upload)
//   Useful for preview before uploading
// ---------------------------------------------------------------------------

app.post('/scan-local', async (req, res) => {
  const naps2 = findNaps2();
  if (!naps2) {
    return res.status(500).json({ error: 'NAPS2 not found' });
  }

  const {
    scannerName,
    scanner,
    driver = 'wia',
    format = 'pdf',
    dpi = 300,
    colorMode,
    color = 'color',
    paperSize = 'letter',
    scanSource,
  } = req.body;

  const resolvedScannerName = scannerName || scanner;
  const resolvedColorMode = colorMode || color;

  const ext = format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'pdf';
  const sessionId = uuidv4();
  const outputFile = path.join(SCANS_DIR, `scan_${sessionId}.${ext}`);

  const bitdepthMap = { color: 'color', gray: 'gray', bw: 'bw' };
  const bitdepth = bitdepthMap[resolvedColorMode] || 'color';
  const pagesizeMap = { letter: 'letter', a4: 'a4', legal: 'legal' };
  const pagesize = pagesizeMap[paperSize] || 'letter';

  let cmd = `"${naps2}" -o "${outputFile}" --driver ${driver}`;
  if (resolvedScannerName) cmd += ` --device "${resolvedScannerName}"`;
  cmd += ` --dpi ${dpi} --bitdepth ${bitdepth} --pagesize ${pagesize}`;
  if (scanSource === 'feeder') cmd += ' --source feeder';
  else if (scanSource === 'glass') cmd += ' --source glass';
  if (ext === 'pdf') cmd += ' --pdfcompat PDF_A_2B';
  cmd += ' --force';

  console.log(`[scan-local] Session ${sessionId} — ${cmd}`);

  try {
    await run(cmd);

    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({ error: 'Output file not created', sessionId });
    }

    const stats = fs.statSync(outputFile);
    res.json({
      success: true,
      sessionId,
      filePath: outputFile,
      fileName: path.basename(outputFile),
      size: stats.size,
      format: ext,
    });
  } catch (err) {
    cleanup(outputFile);
    res.status(500).json({
      error: 'Scan failed',
      details: err.stderr || err.error?.message,
      sessionId,
    });
  }
});

// ---------------------------------------------------------------------------
// POST /upload — upload a previously scanned local file to the cloud
// ---------------------------------------------------------------------------

app.post('/upload', async (req, res) => {
  const authHeader = requireAuthorization(req, res);
  if (!authHeader) {
    return;
  }

  const { title, folderId, folder_id, sessionId, departmentId, description } = req.body;
  const resolvedFolderId = getFolderId({ folder_id, folderId });

  if (!title) return res.status(400).json({ error: 'Missing required field: title' });
  if (!resolvedFolderId) return res.status(400).json({ error: 'Missing required field: folder_id' });
  if (!sessionId) return res.status(400).json({ error: 'Missing required field: sessionId' });

  // Find the file by sessionId
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));
  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found for this sessionId' });
  }

  const filePath = path.join(SCANS_DIR, files[0]);
  try {
    const uploadRes = await uploadDocumentToBackend({
      authHeader,
      filePath,
      title,
      folderId: resolvedFolderId,
      departmentId,
      description,
    });

    cleanup(filePath);

    res.json({
      success: true,
      message: 'Uploaded successfully',
      document: uploadRes.data?.document || uploadRes.data,
    });
  } catch (err) {
    console.error('[upload] Error:', err.message);
    if (err.response) {
      return res.status(err.response.status).json({
        error: 'Upload failed',
        status: err.response.status,
        details: err.response.data,
      });
    }
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /scan/:sessionId/preview — serve a local scan file for preview
// ---------------------------------------------------------------------------

app.get('/scan/:sessionId/preview', (req, res) => {
  const { sessionId } = req.params;
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));

  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found' });
  }

  const filePath = path.join(SCANS_DIR, files[0]);
  const ext = path.extname(files[0]).slice(1);

  const mimeMap = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// DELETE /scan/:sessionId — discard a local scan
// ---------------------------------------------------------------------------

app.delete('/scan/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const files = fs.readdirSync(SCANS_DIR).filter(f => f.includes(sessionId));

  if (files.length === 0) {
    return res.status(404).json({ error: 'Scan file not found' });
  }

  for (const f of files) {
    cleanup(path.join(SCANS_DIR, f));
  }

  res.json({ success: true, message: 'Scan discarded' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  const naps2 = findNaps2();
  console.log('');
  console.log('==============================================');
  console.log('  Maptech DMS — Local Scanner Agent');
  console.log('==============================================');
  console.log(`Scanner Agent running at http://localhost:${PORT}`);
  console.log(`  Server:   http://localhost:${PORT}`);
  console.log(`  Backend:  ${BACKEND_URL}`);
  console.log(`  NAPS2:    ${naps2 || 'NOT FOUND'}`);
  console.log(`  Scans:    ${SCANS_DIR}`);
  console.log(`  Mode:     ${process.pkg ? 'packaged' : 'node'}`);
  console.log('==============================================');
  console.log('');

  if (!naps2) {
    console.warn('WARNING: NAPS2 not found! Scanning will not work.');
    console.warn('Install from https://www.naps2.com/ or set NAPS2_PATH in .env');
  }
});
