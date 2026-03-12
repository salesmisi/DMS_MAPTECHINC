import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_to_a_strong_random_string';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── helpers ──────────────────────────────────────────────
function signToken(userId: string, role: string) {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

function sanitiseUser(row: any) {
  const { password, ...user } = row;
  return {
    ...user,
    createdAt: user.created_at ?? user.createdAt,
  };
}

// ── LOGIN ────────────────────────────────────────────────
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'inactive')
      return res.status(403).json({ error: 'Account is deactivated' });

    const token = signToken(user.id, user.role);
    return res.json({ token, user: sanitiseUser(user) });
  } catch (err) {
    console.error('loginUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ALL USERS ────────────────────────────────────────
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, department, status, avatar, created_at FROM users ORDER BY created_at DESC'
    );
    const users = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    }));
    return res.json(users);
  } catch (err) {
    console.error('getUsers error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET SINGLE USER ──────────────────────────────────────
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, email, role, department, status, avatar, created_at FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const r = result.rows[0];
    return res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('getUserById error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE USER ──────────────────────────────────────────
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, department, status } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });

    // check duplicate
    const dup = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (dup.rows.length > 0)
      return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, department, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, status, avatar, created_at`,
      [name, email, hashed, role || 'staff', department || '', status || 'active']
    );

    const r = result.rows[0];
    return res.status(201).json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('createUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── UPDATE USER ──────────────────────────────────────────
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, status, avatar } = req.body;

    // fetch previous department to detect changes
    const prevRes = await pool.query('SELECT department FROM users WHERE id = $1', [id]);
    const prevDept = prevRes.rows[0]?.department || null;

    const result = await pool.query(
      `UPDATE users
       SET name       = COALESCE($1, name),
           email      = COALESCE($2, email),
           role       = COALESCE($3, role),
           department = COALESCE($4, department),
           status     = COALESCE($5, status),
           avatar     = COALESCE($6, avatar)
       WHERE id = $7
       RETURNING id, name, email, role, department, status, avatar, created_at`,
      [name, email, role, department, status, avatar, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    const r = result.rows[0];

    // If department changed, create a notification for the affected user
    try {
      const newDept = r.department || null;
      if (prevDept !== newDept && newDept) {
        const title = `Assigned to department ${newDept}`;
        const message = `You have been assigned to the ${newDept} department.`;
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
           VALUES ($1, $2, $3, $4, FALSE, NOW())`,
          [id, 'assignment', title, message]
        );
      }
    } catch (e) {
      console.error('Failed to create department assignment notification:', e);
    }
    return res.json({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.department,
      status: r.status,
      avatar: r.avatar,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE USER ──────────────────────────────────────────
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    return res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('deleteUser error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── RESET PASSWORD ───────────────────────────────────────
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id',
      [hashed, id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'User not found' });

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
