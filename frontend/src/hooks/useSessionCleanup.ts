import { useEffect, useRef } from 'react';
import { api } from '../api/client';

/**
 * Registers beforeunload and visibilitychange listeners that fire a best-effort
 * session cleanup beacon when the user closes or navigates away from the tab.
 *
 * Behaviour:
 *  - When a job is actively converting (`isConverting = true`), the browser shows
 *    its native "Leave site?" confirmation prompt before the beacon fires.
 *  - When idle, cleanup is silent — no prompt.
 *
 * Uses sendBeacon so the request survives page teardown.
 * The `isConverting` ref is updated synchronously so event handlers always see
 * the latest value without needing to re-register.
 */
export function useSessionCleanup(isConverting: boolean): void {
  const isConvertingRef = useRef(isConverting);

  // Keep the ref in sync without re-registering event listeners
  useEffect(() => {
    isConvertingRef.current = isConverting;
  }, [isConverting]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent): string | undefined {
      // Fire the beacon regardless — browser may or may not honour it after a prompt
      api.beaconDeleteSession();

      if (isConvertingRef.current) {
        // Returning any non-empty string triggers the browser's native leave-site dialog.
        // The actual string is ignored by modern browsers (they show their own message).
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        api.beaconDeleteSession();
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // intentionally empty — ref handles live isConverting value
}
