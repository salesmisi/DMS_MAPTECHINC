import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import scanWatcher from '../services/scanWatcher.service';

// NAPS2 executable path (can be configured via environment variable)
const NAPS2_PATH = process.env.NAPS2_PATH || 'C:\\Program Files\\NAPS2\\NAPS2.Console.exe';

// Check if NAPS2 is installed
export const checkNaps2Installation = async (_req: AuthRequest, res: Response) => {
  try {
    const exists = fs.existsSync(NAPS2_PATH);

    if (exists) {
      return res.json({
        installed: true,
        path: NAPS2_PATH,
        message: 'NAPS2 is installed and ready'
      });
    }

    // Try to find NAPS2 in common locations
    const commonPaths = [
      'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
      'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NAPS2', 'NAPS2.Console.exe')
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return res.json({
          installed: true,
          path: p,
          message: 'NAPS2 found'
        });
      }
    }

    return res.json({
      installed: false,
      path: null,
      message: 'NAPS2 not found. Please install NAPS2 from https://www.naps2.com/'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// Helper to detect scanners using Windows WMI
const detectWindowsScanners = (): Promise<Array<{ id: string; name: string; type: string; status: string; connection: string }>> => {
  return new Promise((resolve) => {
    const devices: Array<{ id: string; name: string; type: string; status: string; connection: string }> = [];

    // Use PowerShell to get USB imaging devices (scanners)
    const usbScannerCommand = `powershell -Command "Get-WmiObject -Class Win32_PnPEntity | Where-Object { ($_.PNPClass -eq 'Image' -or $_.PNPClass -eq 'Camera' -or $_.Name -match 'scanner|scan|imaging|wia') -and $_.DeviceID -match 'USB' } | Select-Object Name, DeviceID, Status, PNPClass | ConvertTo-Json"`;

    exec(usbScannerCommand, { timeout: 15000 }, (error, stdout) => {
      if (!error && stdout.trim()) {
        try {
          const result = JSON.parse(stdout);
          const items = Array.isArray(result) ? result : [result];
          items.forEach((item: any, index: number) => {
            if (item && item.Name) {
              devices.push({
                id: `usb-${index}`,
                name: item.Name,
                type: 'scanner',
                status: item.Status === 'OK' ? 'ready' : 'offline',
                connection: 'USB'
              });
            }
          });
        } catch (e) {
          // JSON parse failed, ignore
        }
      }

      // Also check for WIA (Windows Image Acquisition) registered devices
      const wiaCommand = `powershell -Command "Get-WmiObject -Query 'SELECT * FROM Win32_PnPEntity WHERE Service=''stisvc'' OR PNPClass=''Image''' | Select-Object Name, DeviceID, Status | ConvertTo-Json"`;

      exec(wiaCommand, { timeout: 15000 }, (wiaError, wiaStdout) => {
        if (!wiaError && wiaStdout.trim()) {
          try {
            const wiaResult = JSON.parse(wiaStdout);
            const wiaItems = Array.isArray(wiaResult) ? wiaResult : [wiaResult];
            wiaItems.forEach((item: any, index: number) => {
              if (item && item.Name) {
                const exists = devices.some(d => d.name.toLowerCase() === item.Name.toLowerCase());
                if (!exists) {
                  const isUsb = item.DeviceID?.includes('USB');
                  devices.push({
                    id: `wia-${index}`,
                    name: item.Name,
                    type: 'scanner',
                    status: item.Status === 'OK' ? 'ready' : 'offline',
                    connection: isUsb ? 'USB' : 'Other'
                  });
                }
              }
            });
          } catch (e) {
            // JSON parse failed, ignore
          }
        }

        // Check for multifunction printers (MFPs) connected via USB
        // Include WorkOffline property to check if printer is actually available
        const printerCommand = `powershell -Command "Get-WmiObject -Class Win32_Printer | Select-Object Name, PortName, PrinterStatus, Local, WorkOffline, PrinterState | ConvertTo-Json"`;

        exec(printerCommand, { timeout: 15000 }, (printerError, printerStdout) => {
          if (!printerError && printerStdout.trim()) {
            try {
              const printerResult = JSON.parse(printerStdout);
              const printers = Array.isArray(printerResult) ? printerResult : [printerResult];
              printers.forEach((printer: any, index: number) => {
                if (printer && printer.Name) {
                  const exists = devices.some(d => d.name.toLowerCase() === printer.Name.toLowerCase());
                  // Check if it's a USB printer (Local=True and USB port)
                  const isUsb = printer.Local && (printer.PortName?.includes('USB') || printer.PortName?.startsWith('USB'));

                  // Skip virtual printers (Microsoft XPS, PDF, OneNote, Fax)
                  const isVirtualPrinter = /Microsoft (XPS|Print to PDF)|OneNote|Fax/i.test(printer.Name);

                  // Determine actual printer status
                  // WorkOffline = true means printer is set to offline mode
                  // PrinterStatus: 0=Other, 1=Unknown, 2=Idle, 3=Printing, 4=Warmup, 5=Stopped, 6=Offline, 7=Paused
                  // PrinterState: 0=Ready, other values indicate various error/offline states
                  const isOffline = printer.WorkOffline === true ||
                                    printer.PrinterStatus === 6 ||
                                    printer.PrinterStatus === 5 ||
                                    printer.PrinterStatus === 7;
                  const isReady = !isOffline && (printer.PrinterStatus === 0 || printer.PrinterStatus === 2 || printer.PrinterStatus === 3 || printer.PrinterStatus === 4);

                  // Include all local printers as they might have scan capability (except virtual printers)
                  if (!exists && printer.Local && !isVirtualPrinter) {
                    devices.push({
                      id: `mfp-${index}`,
                      name: printer.Name,
                      type: 'multifunction',
                      status: isReady ? 'ready' : 'offline',
                      connection: isUsb ? 'USB' : 'Local'
                    });
                  }
                }
              });
            } catch (e) {
              // JSON parse failed, ignore
            }
          }

          resolve(devices);
        });
      });
    });
  });
};

// Helper to detect scanners using NAPS2
const detectNaps2Scanners = (naps2Path: string): Promise<Array<{ id: string; name: string; type: string; status: string; connection: string }>> => {
  return new Promise((resolve) => {
    exec(`"${naps2Path}" --listdevices`, { timeout: 15000 }, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }

      const lines = stdout.split('\n').filter(line => line.trim());
      const scanners = lines.map((name, index) => ({
        id: `naps2-${index}`,
        name: name.trim(),
        type: 'scanner',
        status: 'ready',
        connection: 'NAPS2'
      }));

      resolve(scanners);
    });
  });
};

async function resolveUserScanContext(userId: string, folderId?: string) {
  const userRes = await pool.query('SELECT name, department FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    throw new Error('User not found');
  }

  const userName = userRes.rows[0].name;
  let userDepartment = userRes.rows[0].department || 'General';

  if (folderId) {
    const findRootDepartment = async (currentFolderId: string): Promise<string | null> => {
      const folderRes = await pool.query('SELECT id, name, parent_id, department, is_department FROM folders WHERE id = $1', [currentFolderId]);
      if (folderRes.rows.length === 0) return null;

      const folder = folderRes.rows[0];
      if (folder.is_department || !folder.parent_id) {
        return folder.department || folder.name;
      }

      return findRootDepartment(folder.parent_id);
    };

    const folderDepartment = await findRootDepartment(folderId);
    if (folderDepartment) {
      userDepartment = folderDepartment;
    }
  }

  let departmentId: string | undefined;
  const deptRes = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [userDepartment]);
  if (deptRes.rows.length > 0) {
    departmentId = deptRes.rows[0].id;
  }

  return { userName, userDepartment, departmentId };
}

async function generateUniqueReference(department: string, departmentId?: string): Promise<string> {
  const year = new Date().getFullYear();
  const deptCode = (department || 'GEN').slice(0, 3).toUpperCase();

  let reference = '';
  let lastNumber = 1;
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      if (departmentId) {
        const upsertRes = await pool.query(`
          INSERT INTO document_counters (department_id, year, last_number) VALUES ($1, $2, 1)
          ON CONFLICT (department_id, year) DO UPDATE SET last_number = document_counters.last_number + 1
          RETURNING last_number
        `, [departmentId, year]);
        lastNumber = upsertRes.rows[0].last_number;
      } else {
        const maxRes = await pool.query(`
          SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_num
          FROM documents
          WHERE reference LIKE $1
        `, [`${deptCode}_${year}_%`]);
        lastNumber = maxRes.rows[0]?.next_num || 1;
      }

      if (retries > 0) {
        const randomSuffix = Math.floor(Math.random() * 100);
        reference = `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}_${randomSuffix}`;
      } else {
        reference = `${deptCode}_${year}_${String(lastNumber).padStart(3, '0')}`;
      }

      const existsCheck = await pool.query('SELECT 1 FROM documents WHERE reference = $1', [reference]);
      if (existsCheck.rows.length === 0) {
        return reference;
      }

      retries++;
    } catch {
      retries++;
    }
  }

  return `${deptCode}_${year}_${Date.now()}`;
}

async function createScannedDocument(params: {
  title: string;
  folderId?: string;
  userId: string;
  userName: string;
  department: string;
  departmentId?: string;
  filePath: string;
  fileType: string;
  scannedFrom?: string;
  description?: string;
}) {
  const fileBuffer = fs.readFileSync(params.filePath);
  const fileSize = fs.statSync(params.filePath).size;
  const fileSizeStr = `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
  const relativeFilePath = path.relative(process.cwd(), params.filePath).replace(/\\/g, '/');
  const reference = await generateUniqueReference(params.department, params.departmentId);
  const docId = uuidv4();

  const insertRes = await pool.query(`
    INSERT INTO documents (
      id, title, reference, date, uploaded_by, uploaded_by_id,
      status, version, file_type, size, folder_id, needs_approval,
      department, file_path, file_data, scanned_from, description, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
    ) RETURNING *
  `, [
    docId,
    params.title,
    reference,
    new Date().toISOString().split('T')[0],
    params.userName,
    params.userId,
    'approved',
    1,
    params.fileType,
    fileSizeStr,
    params.folderId || null,
    false,
    params.department,
    relativeFilePath,
    fileBuffer,
    params.scannedFrom || 'NAPS2 Scanner',
    params.description || 'Scanned via NAPS2'
  ]);

  await pool.query(`
    INSERT INTO activity_logs (
      user_id, user_name, user_role, action, target, target_type, details, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `, [
    params.userId,
    params.userName,
    'staff',
    'DOCUMENT_SCANNED',
    params.title,
    'document',
    `Scanned document "${params.title}". Reference: ${reference}`
  ]);

  return insertRes.rows[0];
}

function getStringParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) {
    return param[0] || '';
  }
  return param || '';
}

// Get available scanners using multiple detection methods
export const listScanners = async (_req: AuthRequest, res: Response) => {
  try {
    const allDevices: Array<{ id: string; name: string; type: string; status: string; connection: string }> = [];
    const seenNames = new Set<string>();

    // Try NAPS2 first (most reliable for scanners)
    const naps2Exists = fs.existsSync(NAPS2_PATH);
    if (naps2Exists) {
      const naps2Devices = await detectNaps2Scanners(NAPS2_PATH);
      naps2Devices.forEach(device => {
        const key = device.name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          allDevices.push(device);
        }
      });
    }

    // Also try Windows WMI detection (especially for USB devices)
    const wmiDevices = await detectWindowsScanners();
    wmiDevices.forEach(device => {
      const key = device.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allDevices.push(device);
      }
    });

    // Sort: USB scanners first, then other scanners, then multifunction printers
    allDevices.sort((a, b) => {
      // USB devices first
      if (a.connection === 'USB' && b.connection !== 'USB') return -1;
      if (a.connection !== 'USB' && b.connection === 'USB') return 1;
      // Then scanners before multifunction
      if (a.type === 'scanner' && b.type !== 'scanner') return -1;
      if (a.type !== 'scanner' && b.type === 'scanner') return 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({
      scanners: allDevices,
      naps2Available: naps2Exists,
      message: allDevices.length > 0
        ? `Found ${allDevices.length} device(s)`
        : 'No scanners or printers detected. Make sure your USB device is connected and powered on.'
    });

  } catch (err: any) {
    console.error('Scanner detection error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Create a scan session and trigger NAPS2
export const startScan = async (req: AuthRequest, res: Response) => {
  try {
    const { title, format, folderId, scannerName, multiPage, batchId: incomingBatchId, pageNumber } = req.body;
    const userId = req.userId;
    const isMultiPage = Boolean(multiPage);
    const normalizedPageNumber = Number.isFinite(Number(pageNumber)) ? Math.max(1, Number(pageNumber)) : 1;
    const effectiveFormat = isMultiPage ? 'pdf' : (format || 'pdf');

    if (!title) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (isMultiPage && format && String(format).toLowerCase() !== 'pdf') {
      return res.status(400).json({ error: 'Multi-page scanning currently supports PDF format only' });
    }

    const { userName, userDepartment, departmentId } = await resolveUserScanContext(userId, folderId);

    let batchId: string | undefined;
    if (isMultiPage) {
      batchId = typeof incomingBatchId === 'string' && incomingBatchId.trim() ? incomingBatchId.trim() : undefined;

      if (batchId) {
        const existingBatch = scanWatcher.getMultiPageBatch(batchId);
        if (!existingBatch) {
          return res.status(404).json({ error: 'Scan batch not found. Start a new multi-page scan.' });
        }
        if (existingBatch.userId !== userId) {
          return res.status(403).json({ error: 'You do not have access to this scan batch' });
        }
      } else {
        batchId = uuidv4();
        scanWatcher.createMultiPageBatch({
          batchId,
          title,
          format: 'pdf',
          folderId: folderId || '',
          userId,
          userName,
          department: userDepartment,
          departmentId
        });
      }
    }

    // Create scan session in database
    const sessionId = uuidv4();
    await pool.query(`
      INSERT INTO scan_sessions (id, title, format, folder_id, user_id, user_name, department, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
    `, [sessionId, title, effectiveFormat, folderId || null, userId, userName, userDepartment]);

    // Add to pending scans for file watcher
    scanWatcher.addPendingScan({
      sessionId,
      title,
      format: effectiveFormat,
      folderId: folderId || '',
      userId,
      userName,
      department: userDepartment,
      departmentId,
      batchId,
      pageNumber: normalizedPageNumber,
      createdAt: new Date()
    });

    // Prepare NAPS2 command
    const scansDir = scanWatcher.SCANS_DIR;
    const outputPath = path.join(scansDir, `scan_${sessionId}.${effectiveFormat}`);

    // Check if NAPS2 exists
    const naps2Exists = fs.existsSync(NAPS2_PATH);

    if (!naps2Exists) {
      // NAPS2 not installed - return session info for manual scanning
      return res.json({
        sessionId,
        batchId,
        pageNumber: normalizedPageNumber,
        multiPage: isMultiPage,
        message: 'Scan session created. NAPS2 not found - please scan manually and save to the scans folder.',
        scansDirectory: scansDir,
        status: 'waiting_for_file',
        manualMode: true
      });
    }

    // Build NAPS2 command - use interactive mode (no --device) to let user select scanner in NAPS2 GUI
    // If scannerName is provided and not empty, use it with WIA driver
    let naps2Command: string;

    if (scannerName && scannerName.trim()) {
      // Use specified scanner with WIA driver (most compatible)
      naps2Command = `"${NAPS2_PATH}" -o "${outputPath}" --driver wia --device "${scannerName}"`;
    } else {
      // No scanner specified - open NAPS2 GUI for interactive scanning
      naps2Command = `"${NAPS2_PATH}" -o "${outputPath}" --interactivescan`;
    }

    // Add format-specific options
    if (effectiveFormat === 'pdf') {
      naps2Command += ' --pdfcompat PDF_A_2B';
    }

    console.log('NAPS2 Command:', naps2Command);

    // Execute NAPS2 command
    exec(naps2Command, { timeout: 300000 }, async (error, stdout, stderr) => {
      if (error) {
        console.error('NAPS2 scan error:', stderr || error.message);
        // Update session status
        await pool.query(`
          UPDATE scan_sessions SET status = 'failed', error_message = $1 WHERE id = $2
        `, [stderr || error.message, sessionId]);
      }
      // File watcher will handle the rest when file appears
    });

    return res.json({
      sessionId,
      batchId,
      pageNumber: normalizedPageNumber,
      multiPage: isMultiPage,
      message: scannerName ? `Scanning with ${scannerName}...` : 'NAPS2 opened. Please scan your document.',
      scansDirectory: scansDir,
      status: 'scanning',
      manualMode: false
    });

  } catch (err: any) {
    console.error('startScan error:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const finalizeScanBatch = async (req: AuthRequest, res: Response) => {
  try {
    const batchId = getStringParam(req.params.batchId);
    const userId = req.userId;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const batch = scanWatcher.getMultiPageBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Scan batch not found' });
    }

    if (batch.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this scan batch' });
    }

    if (batch.pages.length === 0) {
      return res.status(400).json({ error: 'No scanned pages found in this batch' });
    }

    const sortedPages = [...batch.pages].sort((a, b) => a.pageNumber - b.pageNumber || a.createdAt.getTime() - b.createdAt.getTime());
    const mergedPdf = await PDFDocument.create();

    for (const page of sortedPages) {
      const pageBytes = fs.readFileSync(page.filePath);
      const sourcePdf = await PDFDocument.load(pageBytes);
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    const mergedBytes = await mergedPdf.save();
    const sanitizedTitle = batch.title.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFileName = `${sanitizedTitle}_${Date.now()}.pdf`;
    const finalFilePath = path.join(process.cwd(), 'uploads', finalFileName);
    fs.writeFileSync(finalFilePath, mergedBytes);

    const document = await createScannedDocument({
      title: batch.title,
      folderId: batch.folderId || undefined,
      userId: batch.userId,
      userName: batch.userName,
      department: batch.department,
      departmentId: batch.departmentId,
      filePath: finalFilePath,
      fileType: 'pdf',
      scannedFrom: 'NAPS2 Scanner',
      description: `Multi-page scan (${sortedPages.length} pages)`
    });

    const sessionIds = sortedPages.map((p) => p.sessionId);
    if (sessionIds.length > 0) {
      await pool.query(`
        UPDATE scan_sessions
        SET document_id = $1, status = 'completed', completed_at = COALESCE(completed_at, NOW())
        WHERE id = ANY($2::uuid[])
      `, [document.id, sessionIds]);
    }

    scanWatcher.clearMultiPageBatch(batchId);

    if (typeof globalThis !== 'undefined') {
      (globalThis as any).lastScannedDocument = {
        id: document.id,
        title: document.title,
        reference: document.reference,
        fileName: finalFileName,
        fileType: 'pdf',
        size: document.size,
        sessionId: sessionIds[sessionIds.length - 1],
        timestamp: new Date().toISOString()
      };
    }

    return res.json({
      message: `Multi-page scan finalized with ${sortedPages.length} page(s)`,
      pages: sortedPages.length,
      document: {
        id: document.id,
        title: document.title,
        reference: document.reference,
        fileType: document.file_type,
        size: document.size,
        status: document.status,
        createdAt: document.created_at
      }
    });
  } catch (err: any) {
    console.error('finalizeScanBatch error:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const discardScanBatch = async (req: AuthRequest, res: Response) => {
  try {
    const batchId = getStringParam(req.params.batchId);
    const userId = req.userId;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const batch = scanWatcher.getMultiPageBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Scan batch not found' });
    }

    if (batch.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this scan batch' });
    }

    for (const page of batch.pages) {
      scanWatcher.removePendingScan(page.sessionId);
    }

    const sessionIds = batch.pages.map((p) => p.sessionId);
    if (sessionIds.length > 0) {
      await pool.query(`
        UPDATE scan_sessions
        SET status = 'cancelled', completed_at = COALESCE(completed_at, NOW())
        WHERE id = ANY($1::uuid[]) AND document_id IS NULL
      `, [sessionIds]);
    }

    scanWatcher.clearMultiPageBatch(batchId);
    return res.json({ message: 'Scan batch discarded' });
  } catch (err: any) {
    console.error('discardScanBatch error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Get scan session status
export const getScanStatus = async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = getStringParam(req.params.sessionId);

    const result = await pool.query(`
      SELECT s.*, d.id as document_id, d.reference, d.file_type
      FROM scan_sessions s
      LEFT JOIN documents d ON s.document_id = d.id
      WHERE s.id = $1
    `, [sessionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan session not found' });
    }

    const session = result.rows[0];

    return res.json({
      sessionId: session.id,
      title: session.title,
      status: session.status,
      documentId: session.document_id,
      reference: session.reference,
      fileType: session.file_type,
      errorMessage: session.error_message,
      createdAt: session.created_at,
      completedAt: session.completed_at
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// Get recent scans for the current user
export const getRecentScans = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const result = await pool.query(`
      SELECT s.*, d.reference, d.file_type, d.size
      FROM scan_sessions s
      LEFT JOIN documents d ON s.document_id = d.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 20
    `, [userId]);

    return res.json({ scans: result.rows });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// Get watcher status
export const getWatcherStatus = async (_req: AuthRequest, res: Response) => {
  try {
    const status = scanWatcher.getWatcherStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// Get last scanned document (for preview)
export const getLastScannedDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const result = await pool.query(`
      SELECT d.*
      FROM documents d
      WHERE d.uploaded_by_id = $1 AND d.scanned_from IS NOT NULL
      ORDER BY d.created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({ document: null });
    }

    const doc = result.rows[0];

    return res.json({
      document: {
        id: doc.id,
        title: doc.title,
        reference: doc.reference,
        fileType: doc.file_type,
        size: doc.size,
        status: doc.status,
        scannedFrom: doc.scanned_from,
        createdAt: doc.created_at
      }
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

// Cancel a pending scan session
export const cancelScan = async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = getStringParam(req.params.sessionId);
    const userId = req.userId;

    // Verify ownership
    const sessionRes = await pool.query(
      'SELECT * FROM scan_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Scan session not found' });
    }

    // Update status
    await pool.query(
      `UPDATE scan_sessions SET status = 'cancelled' WHERE id = $1`,
      [sessionId]
    );

    // Remove from pending scans
    scanWatcher.removePendingScan(sessionId);

    return res.json({ message: 'Scan session cancelled' });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export default {
  checkNaps2Installation,
  listScanners,
  startScan,
  finalizeScanBatch,
  discardScanBatch,
  getScanStatus,
  getRecentScans,
  getWatcherStatus,
  getLastScannedDocument,
  cancelScan
};
