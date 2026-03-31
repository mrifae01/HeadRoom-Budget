/**
 * useTellerConnect — web-only hook that injects the Teller Connect script
 * and returns an `open` function that launches the Teller Connect widget.
 *
 * On non-web platforms the hook is a no-op: open() is a noop and
 * scriptReady is always false.
 *
 * Usage:
 *   const { open, scriptReady } = useTellerConnect();
 *   <Button onPress={() => open(enrollment => bankCtx.connect(enrollment))} />
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { TellerEnrollment } from '../types/teller';

// ─── Global type augmentation (web only) ─────────────────────────────────────

declare global {
  interface Window {
    TellerConnect: {
      setup: (config: {
        applicationId: string;
        environment: string;
        onSuccess: (enrollment: TellerEnrollment) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTellerConnect() {
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    // Only inject on web
    if (Platform.OS !== 'web') return;

    // Avoid double-injection
    if (document.getElementById('teller-connect-script')) {
      setScriptReady(true);
      return;
    }

    const script = document.createElement('script');
    script.id   = 'teller-connect-script';
    script.src  = 'https://cdn.teller.io/connect/connect.js';
    script.async = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);

    return () => {
      // Leave the script in place — removing it would break any open widget
    };
  }, []);

  /**
   * Opens the Teller Connect widget.
   * @param onSuccess Called with the enrollment object when the user completes linking.
   */
  function open(onSuccess: (enrollment: TellerEnrollment) => void) {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !window.TellerConnect) {
      console.warn('[useTellerConnect] TellerConnect not available yet');
      return;
    }

    const applicationId = process.env.EXPO_PUBLIC_TELLER_APP_ID ?? '';
    const environment   = process.env.EXPO_PUBLIC_TELLER_ENV   ?? 'sandbox';

    const handler = window.TellerConnect.setup({
      applicationId,
      environment,
      onSuccess,
      onExit: () => {
        // Widget closed without completing — no action needed
      },
    });

    handler.open();
  }

  return { open, scriptReady };
}
