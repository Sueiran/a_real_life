import { useEffect, useRef } from 'react';
import { useIsPresent } from 'motion/react';

export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !present) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[data-playback-control]')?.focus({ preventScroll: true });
    };
  }, [present]);
  return ref;
}
