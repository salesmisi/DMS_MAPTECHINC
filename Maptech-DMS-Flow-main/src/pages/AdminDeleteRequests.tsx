import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../App';

const API_URL = 'http://localhost:5000/api';

interface DeleteRequest {
  id: string;
  type: 'folder' | 'document';
  target_id: string;
  requested_by: string;
  department: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  requested_by_name?: string;
  // optional resolved target object when enriched client-side
  resolvedTarget?: any;
}

export default function AdminDeleteRequests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, denied: 0, all: 0 });

  const fetchRequests = async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_URL}/delete-requests${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = await res.json();
      // If the request rows don't include a department, try to resolve it
      // by fetching documents and folders (bulk) and mapping by id.
      try {
        const [docsRes, foldersRes] = await Promise.all([
          fetch(`${API_URL}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/folders`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const docsData = docsRes.ok ? await docsRes.json().catch(() => ({})) : {};
        const foldersData = foldersRes.ok ? await foldersRes.json().catch(() => ({})) : {};

        const docsList: any[] = docsData.documents || [];
        const foldersList: any[] = foldersData.folders || [];

        const docById = new Map(docsList.map((d: any) => [String(d.id), d]));
        const folderById = new Map(foldersList.map((f: any) => [String(f.id), f]));

        const enriched = data.map((r: any) => {
          try {
            if (r.type === 'document') {
              const doc = docById.get(String(r.target_id));
              if (doc) return { ...r, department: r.department || doc.department || null, resolvedTarget: doc };
            }
            if (r.type === 'folder') {
              const f = folderById.get(String(r.target_id));
              if (f) return { ...r, department: r.department || f.department || null, resolvedTarget: f };
            }
          } catch (e) {
            // ignore and fall through
          }
          return { ...r, department: r.department || null };
        });

        setRequests(enriched);
      } catch (e) {
        // If enrichment fails, just set raw data
        setRequests(data);
      }
      // also refresh counts when we fetch
      try { await loadCounts(); } catch (_) {}
    } catch (err: any) {
      setError(err.message || 'Error fetching requests');
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const res = await fetch(`${API_URL}/delete-requests?status=all`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const pending = data.filter((r: any) => r.status === 'pending').length;
      const approved = data.filter((r: any) => r.status === 'approved').length;
      const denied = data.filter((r: any) => r.status === 'denied').length;
      setCounts({ pending, approved, denied, all: data.length });
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => { fetchRequests(statusFilter); }, [token, statusFilter]);


  const { navigate, selectFolder } = useNavigation();

  const handleAction = async (id: string, action: 'approve' | 'deny') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/delete-requests/${id}/${action}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || `Error on ${action}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-full mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Delete Request</h2>
      {/* Status tabs */}
      <div className="flex items-center gap-4 mb-4">
          <div className="flex w-full rounded-lg overflow-visible shadow-sm relative">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs border-2 border-white">{counts.pending}</span>
            </span>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`relative flex-1 py-4 text-center ${statusFilter==='pending' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-white text-gray-700'}`}
            >
              <span className="font-semibold">Pending</span>
              {/* floating count badge centered above */}

            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`flex-1 py-4 text-center ${statusFilter==='approved' ? 'bg-white text-gray-700' : 'bg-white text-gray-700'}`}
            >
              <span className="font-semibold">Approved</span>
            </button>
            <button
              onClick={() => setStatusFilter('denied')}
              className={`flex-1 py-4 text-center ${statusFilter==='denied' ? 'bg-white text-gray-700' : 'bg-white text-gray-700'}`}
            >
              <span className="font-semibold">Rejected</span>
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-4 text-center ${statusFilter==='all' ? 'bg-white text-gray-700' : 'bg-white text-gray-700'}`}
            >
              <span className="font-semibold">All</span>
            </button>
          </div>
      </div>
      {loading && <div className="mb-4">Loading...</div>}
      {error && <div className="mb-4 text-red-600">{error}</div>}
      {requests.length === 0 && !loading ? (
        <div className="text-gray-500">No {statusFilter === 'pending' ? 'pending' : statusFilter === 'approved' ? 'approved' : statusFilter === 'denied' ? 'rejected' : 'delete'} requests.</div>
      ) : (
        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Target</th>
              <th className="p-2 text-left">Requested By</th>
              <th className="p-2 text-left">Department</th>
              <th className="p-2 text-left">Reason</th>
              <th className="p-2 text-left">Requested At</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
                      <tr key={req.id} className="border-b">
                      <td className="p-2 capitalize">{req.type}</td>
                      <td className="p-2">
                        {(() => {
                          const title = req.resolvedTarget?.title || req.resolvedTarget?.name || req.target_title || req.target_name || req.target_id;
                          const reference = req.resolvedTarget?.reference || req.resolvedTarget?.reference || req.reference || null;
                          return (
                            <button
                              className="text-left"
                              onClick={() => {
                                try {
                                  if (req.type === 'document') {
                                    const folderId = req.resolvedTarget?.folder_id || req.resolvedTarget?.folderId || null;
                                    if (folderId && selectFolder) selectFolder(folderId);
                                    navigate('documents');
                                  } else {
                                    const fid = req.resolvedTarget?.id || req.target_id;
                                    if (fid && selectFolder) selectFolder(fid);
                                    navigate('folders');
                                  }
                                } catch (e) {
                                  if (req.type === 'document') navigate('documents'); else navigate('folders');
                                }
                              }}
                            >
                              <div className="font-medium text-gray-800">{title}</div>
                              {reference && <div className="text-xs text-gray-500">{reference}</div>}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="p-2">{req.requested_by_name || req.requested_by}</td>
                      <td className="p-2">
                        {req.department ? (
                          <button
                            className="text-blue-600 underline"
                            title={req.type === 'document' ? 'Open in Documents' : 'Open folder'}
                            onClick={() => {
                              try {
                                if (req.type === 'document') {
                                  // try to navigate to Documents and select the containing folder if known
                                  const folderId = req.resolvedTarget?.folder_id || req.resolvedTarget?.folderId || null;
                                  if (folderId && selectFolder) selectFolder(folderId);
                                  navigate('documents');
                                } else {
                                  // folder
                                  const fid = req.resolvedTarget?.id || req.target_id;
                                  if (fid && selectFolder) selectFolder(fid);
                                  navigate('folders');
                                }
                              } catch (e) {
                                // fallback: just navigate
                                if (req.type === 'document') navigate('documents'); else navigate('folders');
                              }
                            }}
                          >
                            {req.department}
                          </button>
                        ) : '-'}
                      </td>
                      <td className="p-2">{req.reason || '-'}</td>
                      <td className="p-2">{new Date(req.created_at).toLocaleString()}</td>
                      <td className="p-2 flex gap-2">
                  <button
                    className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                    onClick={() => handleAction(req.id, 'approve')}
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                    onClick={() => handleAction(req.id, 'deny')}
                    disabled={loading}
                  >
                    Deny
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
