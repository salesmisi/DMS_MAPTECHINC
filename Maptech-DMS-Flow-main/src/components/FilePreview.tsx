import React from 'react';

interface Props {
  doc?: any;
}

const FilePreview: React.FC<Props> = () => {
  return (
    <div className="w-full h-[450px] flex items-center justify-center bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-500">Preview not available.</p>
    </div>
  );
};

export default FilePreview;
