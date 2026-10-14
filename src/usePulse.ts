import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { requireNativeModule } from 'expo';
import { pickerInterval, startFlashes, type Clock } from './interval';

type Snapshot = {
  running: boolean; intervalMs: number; remainingMs: number; flashing: boolean;
  vibrate: boolean; torch: boolean; sound: boolean; warning: string | null;
};
const native = requireNativeModule<{
  hasTorch(): boolean;
  getState(): Snapshot;
  start(intervalMs: number, vibrate: boolean, torch: boolean, sound: boolean): Promise<void>;
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

export function usePulse() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [vibrate, setVibrate] = useState(true);
  const [torch, setTorch] = useState(true);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nativeWarning, setNativeWarning] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const mounted = useRef(true);
  const operation = useRef(0);
  const cancelTimer = useRef<(() => void) | null>(null);
  const intervalMs = pickerInterval(minutes, seconds);

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
      if (state !== 'active') {
        setFlashing(false);
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

  // Read the service's monotonic deadline, including after JS was suspended or
  // the activity was recreated. Never replay old background flashes on resume.
  useEffect(() => {
    if (!android || !active) return;
    const refresh = () => {
      const state = native.getState();
      setRunning(state.running);
      setFlashing(state.flashing);
      setRemainingMs(state.remainingMs);
      if (state.running) {
        setMinutes(Math.floor(state.intervalMs / 60_000));
        setSeconds(Math.floor(state.intervalMs / 1000) % 60);
        setVibrate(state.vibrate);
        setTorch(state.torch);
        setSound(state.sound);
      }
      setNativeWarning(state.warning);
    };
    refresh();
    const poll = setInterval(refresh, 50);
    return () => clearInterval(poll);
  }, [active]);

  useEffect(() => {
    if (android || !running || !active || intervalMs === null) return;
    let deadline = clock.now() + intervalMs;
    let cancelled = false;
    setRemainingMs(intervalMs);
    const cancel = startFlashes(intervalMs, flash => {
      setFlashing(flash);
      if (!flash || AppState.currentState !== 'active') return;
      if (vibrate || sound) void native.pulseFeedback(vibrate, sound).catch(() => {
        if (!cancelled) setMessage('Sound or vibration unavailable.');
      });
      if (torch) void native.pulseTorch().then(ok => {
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
  }, [running, intervalMs, vibrate, torch, sound, active]);

  const start = async () => {
    if (intervalMs === null || busy) return;
    const token = ++operation.current;
    setBusy(true);
    setMessage(null);
    setNativeWarning(null);
    const notices: string[] = [];
    try {
      let useTorch = torch;
      if (useTorch && !native.hasTorch()) {
        useTorch = false;
        notices.push('No rear flashlight is available on this device.');
      }
      if (useTorch) {
        const granted = android
          ? await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA) === PermissionsAndroid.RESULTS.GRANTED
          : await native.requestTorchPermission();
        if (!granted) {
          useTorch = false;
          notices.push('Flashlight is off. Allow Camera in Settings to enable it.');
        }
      }
      if (android && Number(Platform.Version) >= 33) {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          notices.push('Notifications are off. Return here to stop the interval.');
        }
      }
      if (!mounted.current || token !== operation.current) return;
      if (AppState.currentState !== 'active') {
        setMessage('Return to Torstival and press Start to begin.');
        return;
      }
      setTorch(useTorch);
      setMessage(notices.length ? notices.join(' ') : null);
      if (android) await native.start(intervalMs, vibrate, useTorch, sound);
      else setRunning(true);
    } catch {
      if (mounted.current) setMessage('Could not start the interval. Keep the app open and try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  const changeMinutes = (next: number) => { setMinutes(next); if (next === 60) setSeconds(0); };
  return { minutes, setMinutes: changeMinutes, seconds, setSeconds, intervalMs, running, flashing, remainingMs, vibrate, setVibrate,
    torch, setTorch, sound, setSound, busy, message: [message, nativeWarning].filter(Boolean).join(' ') || null, active, start, stop };
}
