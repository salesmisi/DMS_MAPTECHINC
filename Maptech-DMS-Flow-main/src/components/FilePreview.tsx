import React from 'react';
import { Document } from '../context/DocumentContext';
import useSecureFilePreview from '../hooks/useSecureFilePreview';

interface Props {
  doc: Document;
}

const FilePreview: React.FC<Props> = ({ doc }) => {
  const sourcePath = (doc as any).fileUrl || `/uploads/${doc.id}.${doc.fileType}`;
  const { objectUrl, loading, error } = useSecureFilePreview(sourcePath);

  const urlToUse = objectUrl || sourcePath;

  const imageTypes = ['jpg', 'jpeg', 'png', 'tiff'];
  const videoTypes = ['mp4', 'mov', 'avi', 'mkv'];

  if (!sourcePath) {
    return (
      <div className="w-full max-h-[250px] flex items-center justify-center bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-500">No file available for preview.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full max-h-[250px] flex items-center justify-center bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-500">Loading preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-h-[250px] flex flex-col items-center justify-center bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-red-500">{error}</p>
        <p className="text-xs text-gray-400">Preview may be restricted or unavailable.</p>
      </div>
    );
  }

  if (imageTypes.includes(doc.fileType)) {
    return <img src={urlToUse} alt={doc.title} className="w-full max-h-[250px] object-contain rounded-lg" />;
  }

  if (videoTypes.includes(doc.fileType)) {
    return <video src={urlToUse} controls className="w-full max-h-[250px] rounded-lg" />;
  }

  if (doc.fileType === 'pdf') {
    return <iframe src={urlToUse} title="PDF Preview" className="w-full max-h-[250px] rounded-lg" />;
  }

  return (
    <div className="w-full max-h-[250px] flex items-center justify-center bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-500">Preview not available for this file type.</p>
    </div>
  );
};

export default FilePreview;