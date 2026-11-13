import { useState } from 'react';

const KEY_VISIBILITY = 'astro-weather:show-visibility';
const KEY_WIND = 'astro-weather:show-wind';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private browsing / blocked storage - the toggle still works for this page view,
    // it just won't be remembered next time.
  }
}

// Whether to show the extra "viditelnost" (fog) and "vitr" (wind) timeline rows alongside
// cloud cover, per model. A per-browser display preference, not app data - no need for a
// server round-trip or a Settings API call.
export function useDisplayPrefs() {
  const [showVisibility, setShowVisibilityState] = useState(() => readBool(KEY_VISIBILITY, true));
  const [showWind, setShowWindState] = useState(() => readBool(KEY_WIND, true));

  function setShowVisibility(value: boolean) {
    setShowVisibilityState(value);
    writeBool(KEY_VISIBILITY, value);
  }

  function setShowWind(value: boolean) {
    setShowWindState(value);
    writeBool(KEY_WIND, value);
  }

  return { showVisibility, showWind, setShowVisibility, setShowWind };
}
