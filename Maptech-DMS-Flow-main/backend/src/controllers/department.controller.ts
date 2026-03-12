import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import pool from '../db';

// List all departments
export const listDepartments = async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, name, description, created_at FROM departments ORDER BY name');
    // Map to frontend format
    const departments = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      manager: 'TBD',
      description: row.description || '',
      staffCount: 0,
      documentCount: 0
    }));
    return res.json({ departments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('listDepartments error:', message);
    return res.status(500).json({ error: message });
  }
};

// Create a new department
export const createDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    // Check if department already exists
    const existing = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [name.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Department already exists' });
    }

    const result = await pool.query(
      'INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name.trim(), description || '']
    );

    const row = result.rows[0];
    const department = {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      manager: 'TBD',
      description: row.description || '',
      staffCount: 0,
      documentCount: 0
    };

    return res.status(201).json({ department });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('createDepartment error:', message);
    return res.status(500).json({ error: message });
  }
};

// Delete a department
export const deleteDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Department ID is required' });
    }

    const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    return res.json({ message: 'Department deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error('deleteDepartment error:', message);
    return res.status(500).json({ error: message });
  }
};

export default { listDepartments, createDepartment, deleteDepartment };
