import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
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
        const printerCommand = `powershell -Command "Get-WmiObject -Class Win32_Printer | Select-Object Name, PortName, PrinterStatus, Local | ConvertTo-Json"`;

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
                  // Include all local printers as they might have scan capability
                  if (!exists && printer.Local) {
                    devices.push({
                      id: `mfp-${index}`,
                      name: printer.Name,
                      type: 'multifunction',
                      status: printer.PrinterStatus === 3 || printer.PrinterStatus === 0 ? 'ready' : 'offline',
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
    const { title, format, folderId, scannerName } = req.body;
    const userId = req.userId;

    if (!title) {
      return res.status(400).json({ error: 'Document title is required' });
    }

    // Get user info
    const userRes = await pool.query('SELECT name, department FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const userName = userRes.rows[0].name;
    let userDepartment = userRes.rows[0].department || 'General';

    // If a folder is selected, get the root department folder's department
    if (folderId) {
      // Recursive function to find the root parent folder
      const findRootDepartment = async (currentFolderId: string): Promise<string | null> => {
        const folderRes = await pool.query('SELECT id, name, parent_id, department, is_department FROM folders WHERE id = $1', [currentFolderId]);
        if (folderRes.rows.length === 0) return null;

        const folder = folderRes.rows[0];

        // If this is a root department folder, return its department
        if (folder.is_department || !folder.parent_id) {
          return folder.department || folder.name;
        }

        // Otherwise, go up to parent
        return findRootDepartment(folder.parent_id);
      };

      const folderDepartment = await findRootDepartment(folderId);
      if (folderDepartment) {
        userDepartment = folderDepartment;
      }
    }

    // Get department ID if available
    let departmentId: string | undefined;
    const deptRes = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [userDepartment]);
    if (deptRes.rows.length > 0) {
      departmentId = deptRes.rows[0].id;
    }

    // Create scan session in database
    const sessionId = uuidv4();
    await pool.query(`
      INSERT INTO scan_sessions (id, title, format, folder_id, user_id, user_name, department, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
    `, [sessionId, title, format || 'pdf', folderId || null, userId, userName, userDepartment]);

    // Add to pending scans for file watcher
    scanWatcher.addPendingScan({
      sessionId,
      title,
      format: format || 'pdf',
      folderId: folderId || '',
      userId: userId || '',
      userName,
      department: userDepartment,
      departmentId,
      createdAt: new Date()
    });

    // Prepare NAPS2 command
    const scansDir = scanWatcher.SCANS_DIR;
    const outputPath = path.join(scansDir, `scan_${sessionId}.${format || 'pdf'}`);

    // Check if NAPS2 exists
    const naps2Exists = fs.existsSync(NAPS2_PATH);

    if (!naps2Exists) {
      // NAPS2 not installed - return session info for manual scanning
      return res.json({
        sessionId,
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
    if (format === 'pdf') {
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

// Get scan session status
export const getScanStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

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
    const { sessionId } = req.params;
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
  getScanStatus,
  getRecentScans,
  getWatcherStatus,
  getLastScannedDocument,
  cancelScan
};
