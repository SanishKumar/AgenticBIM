"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function Dialog({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  busy?: boolean;
  footer?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`dialog ${wide ? "dialog-wide" : ""} ${footer ? "dialog-with-footer" : ""}`}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {footer ? (
        <>
          <div className="dialog-scroll">{children}</div>
          <div className="dialog-fixed-footer">{footer}</div>
        </>
      ) : (
        children
      )}
    </dialog>
  );
}
