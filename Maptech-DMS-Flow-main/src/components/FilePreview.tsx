import React, { useEffect, useState } from 'react';
import { Document } from '../context/DocumentContext';
import useSecureFilePreview from '../hooks/useSecureFilePreview';

interface Props {
  doc: Document;
}

const FilePreview: React.FC<Props> = ({ doc }) => {
  const sourcePath = (doc as any).fileUrl || `/uploads/${doc.id}.${doc.fileType}`;
  const { objectUrl, loading, error, blob } = useSecureFilePreview(sourcePath);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);

  const urlToUse = objectUrl || sourcePath;

  const imageTypes = ['jpg', 'jpeg', 'png', 'tiff'];
  const videoTypes = ['mp4', 'mov', 'avi', 'mkv'];

  // Always call hooks at top-level: effect below handles conversion for multiple types
  useEffect(() => {
    let cancelled = false;
    setPreviewHtml(null);
    setTextPreview(null);

    async function convert() {
      try {
        if (!blob) return;

        const type = (doc.fileType || '').toLowerCase();

        if (type === 'docx') {
          const mammoth = await import('mammoth');
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (cancelled) return;
          // sanitize
          const dompurify = await import('dompurify');
          const purifier = (dompurify as any).default || dompurify;
          const clean = purifier.sanitize ? purifier.sanitize(result.value || '') : (result.value || '');
          setPreviewHtml(clean || '<p>No preview available.</p>');
          return;
        }

        if (type === 'txt' || type === 'md') {
          const text = await blob.text();
          if (cancelled) return;
          setTextPreview(text);
          return;
        }

        if (type === 'csv') {
          const text = await blob.text();
          if (cancelled) return;
          // render as preformatted text
          setTextPreview(text);
          return;
        }

        if (type === 'xls' || type === 'xlsx') {
          const XLSX = await import('xlsx');
          const arrayBuffer = await blob.arrayBuffer();
          const wb = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheetName = wb.SheetNames && wb.SheetNames[0];
          if (firstSheetName) {
            const sheet = wb.Sheets[firstSheetName];
            const html = XLSX.utils.sheet_to_html(sheet);
            if (cancelled) return;
            const dompurify = await import('dompurify');
            const purifier = (dompurify as any).default || dompurify;
            const clean = purifier.sanitize ? purifier.sanitize(html) : html;
            setPreviewHtml(clean);
            return;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewHtml(null);
          setTextPreview(null);
        }
      }
    }

    convert();

    return () => {
      cancelled = true;
    };
  }, [blob, doc.fileType]);

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
    return (
      <div className="w-full h-[640px] overflow-auto bg-white rounded-lg p-4 border">
        <img src={urlToUse} alt={doc.title} className="w-full h-auto max-h-[600px] object-contain mx-auto" />
      </div>
    );
  }

  if (videoTypes.includes(doc.fileType)) {
    return (
      <div className="w-full h-[640px] overflow-auto bg-white rounded-lg p-4 border">
        <video src={urlToUse} controls className="w-full h-[600px] rounded-lg mx-auto" />
      </div>
    );
  }

  if (doc.fileType === 'pdf') {
    return (
      <div className="w-full h-[640px] overflow-auto bg-white rounded-lg p-0 border">
        <iframe src={urlToUse} title="PDF Preview" className="w-full h-[640px] rounded-lg" />
      </div>
    );
  }

  // Render converted HTML preview (docx/xlsx)
  if (previewHtml) {
    return (
      <div className="w-full h-[640px] overflow-auto bg-white rounded-lg p-6 border">
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    );
  }

  // Render text previews (txt/md/csv)
  if (textPreview) {
    return (
      <div className="w-full h-[640px] overflow-auto bg-white rounded-lg p-4 border">
        <pre className="whitespace-pre-wrap">{textPreview}</pre>
      </div>
    );
  }

  return (
    <div className="w-full max-h-[250px] flex items-center justify-center bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-500">Preview not available for this file type.</p>
    </div>
  );
};

export default FilePreview;