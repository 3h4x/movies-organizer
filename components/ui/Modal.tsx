"use client";

import type { ReactNode } from "react";

interface ModalProps {
  title: ReactNode;
  labelId: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  zIndex?: string;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
}

export default function Modal({
  title,
  labelId,
  onClose,
  children,
  maxWidth = "max-w-lg",
  zIndex = "z-50",
  panelClassName = "",
  closeOnBackdrop = false,
}: ModalProps) {
  return (
    <div
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4 ${zIndex}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`bg-gray-900 border border-gray-700/50 rounded-2xl p-6 w-full shadow-2xl shadow-black/50 ${maxWidth} ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={closeOnBackdrop ? (e) => e.stopPropagation() : undefined}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 id={labelId} className="text-white text-lg font-semibold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors w-10 h-10 rounded-lg hover:bg-gray-800 flex items-center justify-center"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
