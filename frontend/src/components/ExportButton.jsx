// src/components/ExportButton.jsx

import React from 'react';

const ExportButton = ({ onClick, label = 'Export', format = 'csv', disabled = false, className = '' }) => {
  const handleExport = (e) => {
    e.stopPropagation(); // Prevent bubbling if in a table row
    if (onClick) {
      onClick(format); // Pass format if needed
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled}
      className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
};

export default ExportButton;