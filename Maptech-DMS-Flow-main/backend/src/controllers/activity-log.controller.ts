import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import path from 'path';
import ExcelJS from 'exceljs';

// Get all activity logs (admin only)
export const getActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT 
        id, user_id, user_name, user_role, action, target, target_type, 
        ip_address, details, created_at
       FROM activity_logs 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [Number(limit), Number(offset)]
    );

    // Normalize to camelCase for frontend
    const logs = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      action: row.action,
      target: row.target,
      targetType: row.target_type,
      timestamp: row.created_at,
      ipAddress: row.ip_address,
      details: row.details,
    }));

    return res.json({ logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('getActivityLogs error:', message);
    return res.status(500).json({ error: message });
  }
};

// Create a new activity log
export const createActivityLog = async (req: AuthRequest, res: Response) => {
  try {
    const { action, target, targetType, ipAddress, details } = req.body;

    if (!action || !target || !targetType) {
      return res.status(400).json({ error: 'action, target, and targetType are required' });
    }

    // Get user info from auth middleware or request body
    const userId = req.userId || req.body.userId;
    const userName = req.body.userName || 'Unknown';
    const userRole = req.body.userRole || 'staff';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await pool.query(
      `INSERT INTO activity_logs 
        (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [userId, userName, userRole, action, target, targetType, ipAddress || null, details || null]
    );

    const row = result.rows[0];
    const log = {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      action: row.action,
      target: row.target,
      targetType: row.target_type,
      timestamp: row.created_at,
      ipAddress: row.ip_address,
      details: row.details,
    };

    return res.status(201).json({ log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('createActivityLog error:', message);
    return res.status(500).json({ error: message });
  }
};

// Download activity logs as Excel using template
export const downloadActivityLogs = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT created_at, user_name, action, target, ip_address, details
       FROM activity_logs
       ORDER BY created_at DESC`
    );

    const templatePath = path.join(__dirname, '..', '..', '..', 'template', 'activity_log_template.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(500).json({ error: 'Template worksheet not found' });
    }

    // Template layout (merged columns):
    //   A & Z  = decorative sidebar
    //   B:E    = TIMESTAMP (merged)
    //   F:I    = USER      (merged)
    //   J:M    = ACTION    (merged)
    //   N:Q    = TARGET    (merged)
    //   R:U    = IP ADDRESS (no data-row merge in template)
    //   V:Y    = DETAILS   (merged)
    // Rows 1-3 = title, Rows 4-5 = headers, Row 6+ = data

    const DATA_START_ROW = 6;

    // Column start positions for each field (first col of each merged group)
    const COL_TIMESTAMP = 2;   // B
    const COL_USER = 6;        // F
    const COL_ACTION = 10;     // J
    const COL_TARGET = 14;     // N
    const COL_IP = 18;         // R
    const COL_DETAILS = 22;    // V

    // Capture the template style from the first data row before overwriting
    const templateRow = worksheet.getRow(DATA_START_ROW);
    const templateStyles: Record<number, ExcelJS.Style> = {};
    for (let c = 1; c <= 26; c++) {
      const cell = templateRow.getCell(c);
      templateStyles[c] = {
        font: cell.font ? { ...cell.font } : {},
        fill: cell.fill ? { ...cell.fill } : {},
        alignment: cell.alignment ? { ...cell.alignment } : {},
        border: cell.border ? { ...cell.border } : {},
        numFmt: cell.numFmt || '',
        protection: cell.protection ? { ...cell.protection } : {},
      } as ExcelJS.Style;
    }

    // Pre-defined merges exist for rows 6-102 (97 rows) in the template.
    // For rows beyond that, we need to add merges dynamically.
    const TEMPLATE_LAST_ROW = 102;

    result.rows.forEach((log, index) => {
      const rowNum = DATA_START_ROW + index;
      const row = worksheet.getRow(rowNum);

      const timestamp = log.created_at
        ? new Date(log.created_at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })
        : '';

      // Write values into the first cell of each merged group
      row.getCell(COL_TIMESTAMP).value = timestamp;
      row.getCell(COL_USER).value = log.user_name || '';
      row.getCell(COL_ACTION).value = log.action || '';
      row.getCell(COL_TARGET).value = log.target || '';
      row.getCell(COL_IP).value = log.ip_address || '';
      row.getCell(COL_DETAILS).value = log.details || '';

      // Apply template styles to all 26 columns of the row
      for (let c = 1; c <= 26; c++) {
        const cell = row.getCell(c);
        const style = templateStyles[c];
        if (style) {
          cell.font = { ...style.font };
          cell.fill = { ...style.fill } as ExcelJS.Fill;
          cell.alignment = { ...style.alignment };
          cell.border = { ...style.border };
        }
      }

      // Add merges for rows beyond the template's pre-defined range
      if (rowNum > TEMPLATE_LAST_ROW) {
        worksheet.mergeCells(`B${rowNum}:E${rowNum}`);
        worksheet.mergeCells(`F${rowNum}:I${rowNum}`);
        worksheet.mergeCells(`J${rowNum}:M${rowNum}`);
        worksheet.mergeCells(`N${rowNum}:Q${rowNum}`);
        worksheet.mergeCells(`R${rowNum}:U${rowNum}`);
        worksheet.mergeCells(`V${rowNum}:Y${rowNum}`);
      }

      row.commit();
    });

    const filename = `Activity_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('downloadActivityLogs error:', message);
    return res.status(500).json({ error: message });
  }
};

export default { getActivityLogs, createActivityLog, downloadActivityLogs };
