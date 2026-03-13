import { Request, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// List all folders
export const listFolders = async (_req: Request, res: Response) => {
  try {
    // Return folders ordered alphabetically by name (case-insensitive), then by creation time
    const result = await pool.query("SELECT * FROM folders ORDER BY LOWER(name) ASC, created_at ASC");
    const rows = result.rows;

    // If an Authorization token is provided, attempt to verify and return a per-user filtered view
    try {
      const authHeader = String(_req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : (authHeader || null);
      if (token) {
        try {
          const secret = process.env.JWT_SECRET || 'change_me_to_a_strong_random_string';
          const payload: any = jwt.verify(token, secret);
          const userId = payload?.id;
          const userRole = payload?.role;
          if (userId) {
            const ures = await pool.query('SELECT id, role, department FROM users WHERE id = $1', [userId]);
            const user = ures.rows[0];
            let visible = rows;
            if (userRole !== 'admin') {
              visible = rows.filter((folder: any) => {
                const vis = folder.visibility || 'private';
                if (vis === 'admin-only') return false;
                if (vis === 'department') return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
                if (vis === 'private') return String(folder.created_by_id || folder.createdById || '') === String(userId);
                return false;
              });
            }
            return res.json({ folders: rows, visibleFolders: visible });
          }
        } catch (e) {
          // invalid token, fallthrough to return all folders
        }
      }
    } catch (inner) {
      // ignore
    }

    res.json({ folders: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

// Create a new folder
export const createFolder = async (req: AuthRequest, res: Response) => {
  const { name, parentId, department, createdBy, createdById, createdByRole, visibility, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });
  try {
    // Prevent staff from creating root folders
    if ((!parentId || parentId === null) && req.userRole === 'staff') {
      return res.status(403).json({ error: 'Staff are only allowed to create subfolders under existing folders' });
    }
    const id = uuidv4();
    const createdAt = new Date();
    // Use authenticated user info if available
    const actorId = req.userId || createdById || null;
    const actorRole = req.userRole || createdByRole || 'staff';
    const actorNameRes = actorId ? await pool.query('SELECT name FROM users WHERE id = $1', [actorId]) : null;
    const actorName = actorNameRes && actorNameRes.rows[0] ? actorNameRes.rows[0].name : (createdBy || 'System');

    const result = await pool.query(
      `INSERT INTO folders (id, name, parent_id, department, created_by, created_by_id, created_by_role, visibility, permissions, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, name, parentId, department, actorName, actorId, actorRole, visibility, permissions, createdAt]
    );
    res.status(201).json({ folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

// Update a folder
export const updateFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    // fetch existing folder to check protection flag
    const existing = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const folder = existing.rows[0];

    // Prevent renaming/moving of system department folders by non-admins
    if (folder.is_department && req.userRole !== 'admin') {
      if ('name' in updates || 'parent_id' in updates) {
        return res.status(403).json({ error: 'This folder is a protected department folder and cannot be renamed or moved' });
      }
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    if (fields.length === 0) return res.status(400).json({ error: 'No updates provided' });
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE folders SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    res.json({ folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
};

// Delete a folder (and its subfolders)
export const deleteFolder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Check folder exists and protection flag
    const existing = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const folder = existing.rows[0];

    if (folder.is_department && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'This folder is a protected department folder and cannot be deleted' });
    }

    // Delete subfolders first
    await pool.query('DELETE FROM folders WHERE parent_id = $1', [id]);
    // Delete the folder itself
    const result = await pool.query('DELETE FROM folders WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    const deleted = result.rows[0];

    // If the actor is an admin, write an activity log entry
    try {
      if (req.userRole === 'admin') {
        const userId = req.userId || null;
        // try to get user name
        let userName = null;
        if (userId) {
          const u = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
          userName = u.rows[0]?.name || null;
        }
        const ip = (req.headers['x-forwarded-for'] as string) || req.ip || null;
        const details = `Folder "${deleted.name}" was deleted by admin`;
        await pool.query(
          `INSERT INTO activity_logs (user_id, user_name, user_role, action, target, target_type, ip_address, details, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [userId, userName, 'admin', 'FOLDER_DELETED', deleted.name, 'folder', ip, details]
        );
      }
    } catch (logErr) {
      console.error('Failed to write activity log for folder delete:', logErr);
    }

    res.json({ message: 'Folder deleted', folder: deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

export default { listFolders, createFolder, updateFolder, deleteFolder };
