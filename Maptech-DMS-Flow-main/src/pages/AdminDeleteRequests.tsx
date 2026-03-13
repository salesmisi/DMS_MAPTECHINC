import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

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
}

export default function AdminDeleteRequests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/delete-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = await res.json();
      setRequests(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [token]);

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
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Pending Delete Requests</h2>
      {loading && <div className="mb-4">Loading...</div>}
      {error && <div className="mb-4 text-red-600">{error}</div>}
      {requests.length === 0 && !loading ? (
        <div className="text-gray-500">No pending delete requests.</div>
      ) : (
        <table className="w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Type</th>
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
                <td className="p-2">{req.requested_by_name || req.requested_by}</td>
                <td className="p-2">{req.department || '-'}</td>
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
