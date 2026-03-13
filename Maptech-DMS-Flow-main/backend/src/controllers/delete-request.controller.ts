import { Request, Response } from 'express';
import pool from '../db';
import { AuthRequest } from '../middleware/auth.middleware';
import { pool as notificationPool } from '../db';
// Import notification helpers
import { createNotification } from './notification.controller';

// Staff: Request deletion (folder or document)
export const requestDelete = async (req: AuthRequest, res: Response) => {
  try {
    const { type, target_id, reason, department } = req.body;
    const userId = req.userId;
    if (!['folder', 'document'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!target_id || !userId) return res.status(400).json({ error: 'Missing target or user' });
    const result = await pool.query(
      `INSERT INTO delete_requests (type, target_id, requested_by, department, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [type, target_id, userId, department || null, reason || null]
    );
    // Notify all admins
    const admins = await pool.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'delete-request', $2, $3)`,
        [admin.id, `Delete Request: ${type}`, `A staff member requested to delete a ${type}. Please review the request.`]
      );
    }
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('requestDelete error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: List all pending delete requests
export const listDeleteRequests = async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT dr.*, u.name as requested_by_name FROM delete_requests dr
       LEFT JOIN users u ON dr.requested_by = u.id
       WHERE dr.status = 'pending' ORDER BY dr.created_at ASC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listDeleteRequests error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Approve a delete request
export const approveDeleteRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    // Mark as approved
    const result = await pool.query(
      `UPDATE delete_requests SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [adminId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed' });
    const request = result.rows[0];

    // Notify requester of approval
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'delete-approved', $2, $3)`,
      [request.requested_by, `Delete Approved: ${request.type}`, `Your request to delete the ${request.type} has been approved and processed by admin.`]
    );

    // Perform the actual deletion based on type
    let deleteResult;
    if (request.type === 'folder') {
      // Delete folder and subfolders
      const folderRes = await pool.query('SELECT * FROM folders WHERE id = $1', [request.target_id]);
      if (folderRes.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
      // Delete subfolders first
      await pool.query('DELETE FROM folders WHERE parent_id = $1', [request.target_id]);
      // Delete the folder itself
      deleteResult = await pool.query('DELETE FROM folders WHERE id = $1 RETURNING *', [request.target_id]);
      // Optionally: log activity here
    } else if (request.type === 'document') {
      // Delete document
      const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [request.target_id]);
      if (docRes.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
      deleteResult = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING *', [request.target_id]);
      // Optionally: log activity here
    } else {
      return res.status(400).json({ error: 'Invalid delete request type' });
    }

    return res.json({ request, deleted: deleteResult.rows[0] });
  } catch (err) {
    console.error('approveDeleteRequest error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Deny a delete request
export const denyDeleteRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    // Mark as denied
    const result = await pool.query(
      `UPDATE delete_requests SET status = 'denied', denied_by = $1, denied_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [adminId, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found or already processed' });
    // Notify requester of denial
    const deniedRequest = result.rows[0];
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'delete-denied', $2, $3)`,
      [deniedRequest.requested_by, `Delete Denied: ${deniedRequest.type}`, `Your request to delete the ${deniedRequest.type} was denied by admin.`]
    );
    return res.json(deniedRequest);
  } catch (err) {
    console.error('denyDeleteRequest error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
