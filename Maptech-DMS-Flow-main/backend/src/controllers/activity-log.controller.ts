import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';

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

export default { getActivityLogs, createActivityLog };
