import { Request, Response } from 'express';
import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

// List all folders
export const listFolders = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM folders ORDER BY created_at ASC');
    res.json({ folders: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
};

// Create a new folder
export const createFolder = async (req: Request, res: Response) => {
  const { name, parentId, department, createdBy, createdById, createdByRole, visibility, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name is required' });
  try {
    const id = uuidv4();
    const createdAt = new Date();
    const result = await pool.query(
      `INSERT INTO folders (id, name, parent_id, department, created_by, created_by_id, created_by_role, visibility, permissions, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, name, parentId, department, createdBy, createdById, createdByRole, visibility, permissions, createdAt]
    );
    res.status(201).json({ folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

// Update a folder
export const updateFolder = async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  try {
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
export const deleteFolder = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Delete subfolders first
    await pool.query('DELETE FROM folders WHERE parent_id = $1', [id]);
    // Delete the folder itself
    const result = await pool.query('DELETE FROM folders WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Folder not found' });
    res.json({ message: 'Folder deleted', folder: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

export default { listFolders, createFolder, updateFolder, deleteFolder };
