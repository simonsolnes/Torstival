import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { requireNativeModule } from 'expo';
import { pickerInterval, startFlashes, type Clock } from './interval';

type Options = { vibrate: boolean; torch: boolean; sound: boolean; screen: boolean };
type Snapshot = Options & {
  running: boolean; intervalMs: number; remainingMs: number; flashing: boolean; warning: string | null;
};
const native = requireNativeModule<{
  hasTorch(): boolean;
  getState(): Snapshot;
  start(intervalMs: number, vibrate: boolean, torch: boolean, sound: boolean, screen: boolean): Promise<void>;
  updateOptions(vibrate: boolean, torch: boolean, sound: boolean, screen: boolean): Promise<Snapshot | undefined>;
  stop(): Promise<void>;
  requestTorchPermission(): Promise<boolean>;
  pulseTorch(): Promise<boolean>;
  pulseFeedback(vibrate: boolean, sound: boolean): Promise<void>;
}>('TorstivalPulse');
const android = Platform.OS === 'android';
const clock: Clock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

async function allowTorch(notices: string[]): Promise<boolean> {
  if (!native.hasTorch()) {
    notices.push('No rear flashlight is available on this device.');
    return false;
  }
  const granted = android
    ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA) === PermissionsAndroid.RESULTS.GRANTED
    : await native.requestTorchPermission();
  // iOS can resolve the permission prompt just before its active event arrives.
  if (!android && AppState.currentState === 'inactive') {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timeout); subscription.remove(); resolve(); };
      const subscription = AppState.addEventListener('change', state => {
        if (state !== 'inactive') finish();
      });
      const timeout = setTimeout(finish, 2000);
    });
  }
  if (!granted) notices.push('Flashlight is off. Allow Camera in Settings to enable it.');
  return granted;
}

export function usePulse() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [options, setOptions] = useState<Options>({ vibrate: true, torch: true, sound: true, screen: true });
  // The iOS timer reads live options without re-creating its cadence on each edit.
  const optionsRef = useRef(options);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updatingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nativeWarning, setNativeWarning] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const mounted = useRef(true);
  const operation = useRef(0);
  const cancelTimer = useRef<(() => void) | null>(null);
  const intervalMs = pickerInterval(minutes, seconds);

  const applyOptions = useCallback(({ vibrate, torch, sound, screen }: Options) => {
    const next = { vibrate, torch, sound, screen };
    optionsRef.current = next;
    setOptions(previous => Object.keys(next).every(key => previous[key as keyof Options] === next[key as keyof Options]) ? previous : next);
    if (!screen) setFlashing(false);
  }, []);

  const stop = useCallback(async () => {
    operation.current++;
    cancelTimer.current?.();
    cancelTimer.current = null;
    setRunning(false);
    setFlashing(false);
    setRemainingMs(0);
    setBusy(true);
    try { await native.stop(); }
    catch { if (mounted.current) setMessage('Could not stop the pulse. Try Stop again or use the notification.'); }
    finally { if (mounted.current) setBusy(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') setFlashing(false);
      // A permission dialog is temporarily inactive, not a stopped session.
      if (state === 'background') {
        operation.current++;
        if (!android) {
          cancelTimer.current?.();
          cancelTimer.current = null;
          setRunning(false);
          void native.stop().catch(() => {});
        }
      }
    });
    return () => {
      mounted.current = false;
      operation.current++;
      subscription.remove();
      cancelTimer.current?.();
      if (!android) void native.stop().catch(() => {});
    };
  }, []);

  // Restore service options/deadline after suspension without overwriting an edit
  // that is waiting for a permission prompt or native acknowledgement.
  useEffect(() => {
    if (!android || !active) return;
    const refresh = () => {
      const state = native.getState();
      setRunning(state.running);
      setFlashing(state.flashing && optionsRef.current.screen);
      setRemainingMs(state.remainingMs);
      if (state.running) {
        setMinutes(Math.floor(state.intervalMs / 60_000));
        setSeconds(Math.floor(state.intervalMs / 1000) % 60);
        if (!updatingRef.current) applyOptions(state);
      }
      setNativeWarning(state.warning);
    };
    refresh();
    const poll = setInterval(refresh, 50);
    return () => clearInterval(poll);
  }, [active, applyOptions]);

  useEffect(() => {
    if (android || !running || intervalMs === null) return;
    let deadline = clock.now() + intervalMs;
    let cancelled = false;
    setRemainingMs(intervalMs);
    const cancel = startFlashes(intervalMs, flash => {
      const current = optionsRef.current;
      const visible = AppState.currentState === 'active';
      setFlashing(flash && current.screen && visible);
      if (!flash || !visible) return;
      if (current.vibrate || current.sound) void native.pulseFeedback(current.vibrate, current.sound).catch(() => {
        if (!cancelled) setMessage('Sound or vibration unavailable.');
      });
      if (current.torch) void native.pulseTorch().then(ok => {
        if (!ok && !cancelled) setMessage('Flashlight unavailable. It may be in use or too warm.');
      }).catch(() => { if (!cancelled) setMessage('Flashlight unavailable.'); });
    }, clock, next => { deadline = next; });
    const countdown = setInterval(() => setRemainingMs(Math.max(0, deadline - clock.now())), 50);
    const cleanup = () => {
      cancelled = true;
      cancel();
      clearInterval(countdown);
      void native.stop().catch(() => {});
    };
    cancelTimer.current = cleanup;
    return () => { cleanup(); cancelTimer.current = null; };
  }, [running, intervalMs]);

  const changeOption = async (key: keyof Options, enabled: boolean) => {
    if (busy || updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    const token = ++operation.current;
    const previous = optionsRef.current;
    const next = { ...previous, [key]: enabled };
    const notices: string[] = [];
    setMessage(null);
    try {
      if (key === 'torch' && enabled) next.torch = await allowTorch(notices);
      if (!mounted.current || token !== operation.current || AppState.currentState !== 'active') return;
      applyOptions(next);
      const snapshot = await native.updateOptions(next.vibrate, next.torch, next.sound, next.screen);
      if (!mounted.current || token !== operation.current) return;
      if (snapshot?.running) applyOptions(snapshot);
      setNativeWarning(snapshot?.warning ?? null);
      setMessage(notices.length ? notices.join(' ') : null);
    } catch {
      if (mounted.current && token === operation.current) {
        applyOptions(previous);
        setMessage('Could not change the setting. Try again.');
      }
    } finally {
      updatingRef.current = false;
      if (mounted.current) setUpdating(false);
    }
  };

  const start = async () => {
    if (intervalMs === null || busy || updatingRef.current) return;
    const token = ++operation.current;
    setBusy(true);
    setMessage(null);
    setNativeWarning(null);
    const next = { ...optionsRef.current };
    const notices: string[] = [];
    try {
      if (next.torch) next.torch = await allowTorch(notices);
      if (android && Number(Platform.Version) >= 33) {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) notices.push('Notifications are off. Return here to stop the interval.');
      }
      if (!mounted.current || token !== operation.current) return;
      if (AppState.currentState !== 'active') {
        setMessage('Return to Torstival and press Start to begin.');
        return;
      }
      applyOptions(next);
      setMessage(notices.length ? notices.join(' ') : null);
      if (android) await native.start(intervalMs, next.vibrate, next.torch, next.sound, next.screen);
      else setRunning(true);
    } catch {
      if (mounted.current) setMessage('Could not start the interval. Keep the app open and try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  const changeMinutes = (next: number) => { setMinutes(next); if (next === 60) setSeconds(0); };
  return { minutes, setMinutes: changeMinutes, seconds, setSeconds, intervalMs, running,
    flashing: flashing && options.screen, remainingMs, options, changeOption, busy, updating,
    message: [message, nativeWarning].filter(Boolean).join(' ') || null, active, start, stop };
}
