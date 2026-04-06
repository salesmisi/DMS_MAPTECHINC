import React, { useMemo } from 'react';
import { ScannerPanel } from '../components/ScannerPanel';
import { useDocuments } from '../context/DocumentContext';

export function ScannerDashboard() {
  const { folders, refreshDocuments } = useDocuments();

  const folderOptions = useMemo(
    () => folders
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
      })),
    [folders]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#f4efd8] via-[#eef5e3] to-[#edf0d5] p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5f6f52]">
          Scanner Workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#1f3d1c]">Scan Through the Local Agent</h1>
        <p className="mt-3 max-w-3xl text-sm text-[#56654c]">
          This page connects the DMS frontend to the local scanner agent on port 3001. Use a connected NAPS2 device,
          preview the capture when needed, and upload the finished scan into an existing folder.
        </p>
      </div>

      <ScannerPanel folders={folderOptions} onUploaded={refreshDocuments} />
    </div>
  );
}