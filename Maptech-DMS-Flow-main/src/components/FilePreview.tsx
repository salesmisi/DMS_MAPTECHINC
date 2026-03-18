import React, { useEffect, useState } from 'react';
import { FileText, Film, Maximize2, Minimize2, X } from 'lucide-react';

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
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Close fullscreen on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    if (isFullscreen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

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
      <>
        <div className="w-full h-[350px] flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden relative group">
          <img src={objectUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        {isFullscreen && (
          <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="Close (Esc)"
            >
              <X size={24} />
            </button>
            <img src={objectUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </>
    );
  }

  if (isPdf && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] bg-gray-50 rounded-lg overflow-hidden relative group">
          <iframe src={objectUrl} className="w-full h-full border-0 rounded-lg" title={doc.title} />
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        {isFullscreen && (
          <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col">
            <div className="flex items-center justify-between p-4 bg-gray-900">
              <h3 className="text-white font-medium truncate flex-1 mr-4">{doc.title}</h3>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors flex items-center gap-2"
                title="Close (Esc)"
              >
                <Minimize2 size={18} />
                <span className="text-sm">Exit Fullscreen</span>
              </button>
            </div>
            <div className="flex-1 p-4">
              <iframe
                src={objectUrl}
                className="w-full h-full border-0 rounded-lg bg-white"
                title={doc.title}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  if (isVideo && objectUrl) {
    return (
      <>
        <div className="w-full h-[350px] flex items-center justify-center bg-black rounded-lg overflow-hidden relative group">
          <video src={objectUrl} controls className="max-w-full max-h-full">
            Your browser does not support video playback.
          </video>
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        {isFullscreen && (
          <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
              title="Close (Esc)"
            >
              <X size={24} />
            </button>
            <video src={objectUrl} controls autoPlay className="max-w-full max-h-full">
              Your browser does not support video playback.
            </video>
          </div>
        )}
      </>
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
