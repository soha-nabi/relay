import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Failed to load data',
  message = 'An unexpected error occurred while communicating with the recovery engine.',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-2xl border border-rose-200 bg-rose-50/40 ${className}`}
    >
      <div className="p-3 rounded-full bg-rose-100 text-rose-600 mb-3">
        <AlertCircle size={24} />
      </div>
      <h4 className="text-sm sm:text-base font-bold text-rose-900 tracking-tight">
        {title}
      </h4>
      <p className="text-xs sm:text-sm text-rose-700 max-w-md mt-1 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition shadow-sm"
        >
          <RotateCcw size={13} />
          Retry Request
        </button>
      )}
    </div>
  );
}
