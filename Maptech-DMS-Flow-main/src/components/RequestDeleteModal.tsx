import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

interface Props {
  document: any;
  onClose: () => void;
  onRequested: () => void;
}

const RequestDeleteModal: React.FC<Props> = ({ document, onClose, onRequested }) => {
  const { token } = useAuth();
  const { fetchNotifications } = useNotifications();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:5000/api/delete-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: document.type || 'document',
          target_id: document.id,
          reason,
        }),
      });
      if (!res.ok) throw new Error('Failed to request delete');
      setSuccess(true);
      await fetchNotifications();
      onRequested();
    } catch (err: any) {
      setError(err.message || 'Failed to request delete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-2">Request Document Deletion</h3>
        <p className="mb-4 text-gray-600">This will send a request to the admin for approval. The document will not be deleted until approved.</p>
        <textarea
          className="w-full border rounded p-2 mb-4"
          rows={3}
          placeholder="Reason for deletion (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {success && <div className="text-green-600 mb-2">Request sent for approval.</div>}
        <div className="flex gap-2 justify-end">
          <button
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onClose}
            disabled={loading}
          >Cancel</button>
          <button
            className="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700"
            onClick={handleRequest}
            disabled={loading}
          >{loading ? 'Requesting...' : 'Request Delete'}</button>
        </div>
      </div>
    </div>
  );
};

export default RequestDeleteModal;
