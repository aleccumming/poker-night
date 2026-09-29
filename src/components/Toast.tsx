import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastOptions {
  /** Shows an "Undo" button that runs this. */
  undo?: () => void;
}
type ShowToast = (message: string, opts?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});
const ClearContext = createContext<() => void>(() => {});
export const useToast = () => useContext(ToastContext);
/** Hides any toast now, e.g. when the screen changes so an old "Undo" can't be tapped. */
export const useClearToast = () => useContext(ClearContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; undo?: () => void; key: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>((message, opts = {}) => {
    window.clearTimeout(timer.current);
    setToast({ message, undo: opts.undo, key: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), opts.undo ? 3500 : 2500);
  }, []);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <ClearContext.Provider value={clear}>{children}</ClearContext.Provider>
      <div className="toast-wrap" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.key}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="toast-undo"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
