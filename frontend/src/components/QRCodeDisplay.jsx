// src/components/QRCodeDisplay.jsx

import React from 'react';

const QRCodeDisplay = ({ dataUrl, alt = 'QR Code', className = 'mx-auto' }) => {
  return (
    <div className={`flex justify-center ${className}`}>
      <img
        src={dataUrl}
        alt={alt}
        className="w-48 h-48 sm:w-56 sm:h-56 border border-gray-300 rounded-lg shadow-md"
      />
    </div>
  );
};

export default QRCodeDisplay;