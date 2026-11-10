import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

// Tab screens are mounted up front (so the first visit is instant too), but
// useFocusEffect would only load them once focused. This loads on mount and whenever
// `load` changes (new month), and again each time the tab comes back into focus, so a
// change made on another tab shows up without a loader.
export function useRefresh(load: () => void, enabled: boolean): void {
  const latest = useRef(load);
  latest.current = load;
  const lastRun = useRef(0);
  const navigation = useNavigation();

  useEffect(() => {
    if (!enabled) return;
    lastRun.current = Date.now();
    load();
  }, [load, enabled]);

  useEffect(
    () =>
      navigation.addListener('focus', () => {
        // The focus event that comes with the first render would repeat the mount load.
        if (!enabled || Date.now() - lastRun.current < 1000) return;
        lastRun.current = Date.now();
        latest.current();
      }),
    [navigation, enabled],
  );
}
