import React, { useEffect, useState } from 'react';
import { FileText, Film } from 'lucide-react';

interface Props {
  doc?: any;
}

const PREVIEW_TYPES = ['pdf', 'png', 'jpg', 'jpeg', 'mp4'];
const OFFICE_TYPES = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
const ARCHIVE_TYPES = ['zip'];

const FilePreview: React.FC<Props> = ({ doc }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileType = (doc?.fileType || doc?.file_type || '').toLowerCase();
  const isPreviewable = PREVIEW_TYPES.includes(fileType);
  const isOffice = OFFICE_TYPES.includes(fileType);
  const isArchive = ARCHIVE_TYPES.includes(fileType);
  const isImage = ['png', 'jpg', 'jpeg'].includes(fileType);
  const isVideo = ['mp4'].includes(fileType);
  const isPdf = fileType === 'pdf';

  useEffect(() => {
    if (!doc?.id || (!isPreviewable && !isOffice && !isArchive)) return;

    let aborted = false;
    setLoading(true);
    setError(null);

    const fetchPreview = async () => {
      try {
        const token = localStorage.getItem('dms_token');
        const res = await fetch(`http://localhost:5000/api/documents/${doc.id}/preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (aborted) return;
        if (!res.ok) throw new Error(`Failed to load preview (${res.status})`);
        const blob = await res.blob();
        if (aborted) return;

        if (isOffice) {
          // For Office files, create a download URL for Office Online viewer
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
        } else {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
        }
      } catch (e: any) {
        if (!aborted) setError(e.message || 'Failed to load preview');
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      aborted = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.id]);

  if (!doc) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-500">No document selected.</p>
      </div>
    );
  }

  if (!isPreviewable && !isOffice && !isArchive) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-2">
        <FileText size={40} className="text-gray-300" />
        <p className="text-sm text-gray-500">Preview not available for .{fileType} files.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-[#427A43] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-2">
        <FileText size={40} className="text-gray-300" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (isImage && objectUrl) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
        <img src={objectUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (isPdf && objectUrl) {
    return (
      <div className="w-full h-[350px] bg-gray-50 rounded-lg overflow-hidden">
        <iframe src={objectUrl} className="w-full h-full border-0 rounded-lg" title={doc.title} />
      </div>
    );
  }

  if (isVideo && objectUrl) {
    return (
      <div className="w-full h-[350px] flex items-center justify-center bg-black rounded-lg overflow-hidden">
        <video src={objectUrl} controls className="max-w-full max-h-full">
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (isOffice && objectUrl) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-3">
        <FileText size={40} className="text-[#427A43]" />
        <p className="text-sm text-gray-600 font-medium">{doc.title}.{fileType}</p>
        <a
          href={objectUrl}
          download={`${doc.title}.${fileType}`}
          className="px-4 py-2 bg-[#005F02] text-white text-sm rounded-lg hover:bg-[#427A43] transition-colors"
        >
          Download to Preview
        </a>
      </div>
    );
  }

  if (isArchive && objectUrl) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 rounded-lg gap-3">
        <FileText size={40} className="text-[#427A43]" />
        <p className="text-sm text-gray-600 font-medium">{doc.title}.{fileType}</p>
        <a
          href={objectUrl}
          download={`${doc.title}.${fileType}`}
          className="px-4 py-2 bg-[#005F02] text-white text-sm rounded-lg hover:bg-[#427A43] transition-colors"
        >
          Download File
        </a>
      </div>
    );
  }

  return (
    <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-500">Preview not available.</p>
    </div>
  );
};

export default FilePreview;
