import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './db';
import fs from 'fs';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.get('/', (req, res) => res.send('API running'));

// Auto-migration: ensure schema is up to date
async function runMigrations() {
  const client = await (await import('./db')).default.connect();
  try {
    // Ensure UUID extension is available first
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    // Fix departments table: ensure id has a UUID default
    await client.query(`ALTER TABLE departments ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
    // Add missing columns to departments table
    await client.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT`);

    // Add missing columns to documents table
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by VARCHAR(150)`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS scanned_from VARCHAR(100)`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
    // Ensure id column has a default UUID generator
    await client.query(`ALTER TABLE documents ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
    // Make department_id nullable (we may not always have a matching dept UUID)
    await client.query(`ALTER TABLE documents ALTER COLUMN department_id DROP NOT NULL`);
    // Make department nullable too (added by migration, may not have NOT NULL)
    await client.query(`ALTER TABLE documents ALTER COLUMN department DROP NOT NULL`);
    // Create document_counters table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_counters (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        year          INTEGER NOT NULL,
        last_number   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(department_id, year)
      )
    `);
    // Ensure folders table has is_department column
    try {
      await client.query(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_department BOOLEAN NOT NULL DEFAULT FALSE`);
    } catch (e) {
      // ignore
    }
    console.log('Migrations applied successfully');
  } catch (e: any) {
    console.warn('Migration warning:', e?.message || e);
  } finally {
    client.release();
  }
}

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import departmentRoutes from './routes/department.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import activityLogRoutes from './routes/activity-log.routes';

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity-logs', activityLogRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await runMigrations();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

export default app;
