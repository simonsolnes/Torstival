import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { formatCountdown } from './src/interval';
import { usePulse } from './src/usePulse';

function KeepScreenAwake() {
  useKeepAwake();
  return null;
}

function TimePicker({ label, value, max, disabled, onChange }: {
  label: string; value: number; max: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <View style={styles.pickerColumn} pointerEvents={disabled ? 'none' : 'auto'}>
    <Text style={styles.unit}>{label}</Text>
    <Picker accessibilityLabel={label} accessibilityState={{ disabled }} selectedValue={value}
      onValueChange={next => { if (!disabled) onChange(next); }}
      enabled={!disabled} mode="dropdown" dropdownIconColor="#c4b5fd"
      style={styles.picker} itemStyle={styles.pickerItem}>
      {Array.from({ length: max + 1 }, (_, number) =>
        <Picker.Item key={number} value={number} label={String(number).padStart(2, '0')}
          color="#f4f1e9" style={{ backgroundColor: '#1c1f26' }} />)}
    </Picker>
  </View>;
}

export default function App() {
  const { minutes, setMinutes, seconds, setSeconds, intervalMs, running, flashing, remainingMs,
    options, changeOption, busy, updating, message, active, start, stop } = usePulse();
  const disabled = busy || (!running && (intervalMs === null || updating));

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style={flashing ? 'dark' : 'light'} />
        {running && active && <KeepScreenAwake />}
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.brand}>TORSTIVAL</Text>
              <Text style={styles.status}>{running ? 'Running' : 'Ready'}</Text>
            </View>
            <View style={styles.main}>
              <View style={styles.card}>
                <Text style={styles.label}>{running ? 'NEXT PULSE' : 'INTERVAL'}</Text>
                {running ? <View style={styles.countdownContainer}>
                  <Text style={styles.countdown} testID="countdown-value" numberOfLines={1} adjustsFontSizeToFit>
                    {formatCountdown(remainingMs)}
                  </Text>
                  <Text style={styles.unit}>Every {formatCountdown(intervalMs ?? 0)}</Text>
                </View> : <View style={styles.pickerRow}>
                  <TimePicker label="Minutes" value={minutes} max={60} disabled={busy} onChange={setMinutes} />
                  <TimePicker label="Seconds" value={seconds} max={minutes === 60 ? 0 : 59}
                    disabled={busy || minutes === 60} onChange={setSeconds} />
                </View>}
                {intervalMs === null && <Text style={styles.error}>Choose at least 1 second.</Text>}
              </View>
              <View style={styles.options}>
                {([
                  ['Flash screen', 'screen'],
                  ['Vibration', 'vibrate'],
                  ['Flashlight', 'torch'],
                  ['Sound', 'sound'],
                ] as const).map(([label, key]) => <View key={key} style={styles.option}>
                  <Text style={styles.optionText}>{label}</Text>
                  <Switch accessibilityLabel={label} value={options[key]}
                    onValueChange={value => { void changeOption(key, value); }}
                    disabled={busy || updating} trackColor={{ true: '#8c75d2', false: '#343842' }} />
                </View>)}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={running ? 'Stop' : 'Start'}
                accessibilityState={{ disabled, busy }} testID="toggle-button" disabled={disabled}
                onPress={() => { void (running ? stop() : start()); }}
                style={({ pressed }) => [styles.button, running && styles.stopButton,
                  disabled && styles.disabledButton, pressed && styles.pressed]}>
                <Text style={[styles.buttonText, running && styles.stopButtonText]}>
                  {busy ? 'Please wait…' : running ? 'Stop' : 'Start'}
                </Text>
              </Pressable>
              <Text style={styles.note}>{Platform.OS === 'android' ? 'Runs in the background.' : 'Keep the app open.'}</Text>
              {message && <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text>}
            </View>
          </ScrollView>
        </SafeAreaView>
        {flashing && <View pointerEvents="none" testID="flash-overlay" style={styles.flash} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111318' },
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: 28, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  brand: { color: '#f4f1e9', fontSize: 15, letterSpacing: 3, fontWeight: '800' },
  status: { color: '#a5abb7', fontSize: 13 },
  main: { flex: 1, justifyContent: 'center', paddingVertical: 28 },
  card: { borderRadius: 24, backgroundColor: '#1c1f26', borderWidth: 1, borderColor: '#30343e', padding: 20 },
  label: { color: '#a5abb7', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  pickerRow: { flexDirection: 'row', marginTop: 20, gap: 8 },
  pickerColumn: { flex: 1 },
  picker: { color: '#f4f1e9', width: '100%' },
  pickerItem: { color: '#f4f1e9', fontSize: 32 },
  unit: { color: '#a5abb7', fontSize: 13, textAlign: 'center' },
  countdownContainer: { minHeight: Platform.OS === 'ios' ? 252 : 90, justifyContent: 'center' },
  countdown: { color: '#c4b5fd', fontSize: 72, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  options: { marginTop: 20, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  optionText: { color: '#d5d1df', fontSize: 16 },
  error: { color: '#f0c98c', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  button: { backgroundColor: '#c4b5fd', borderRadius: 18, minHeight: 64, justifyContent: 'center', alignItems: 'center', marginTop: 24, padding: 16 },
  stopButton: { backgroundColor: '#292333', borderWidth: 1, borderColor: '#77658d' },
  buttonText: { color: '#211a32', fontSize: 18, fontWeight: '700' },
  stopButtonText: { color: '#e0d4f7' },
  disabledButton: { opacity: 0.35 },
  pressed: { opacity: 0.75 },
  note: { color: '#a5abb7', textAlign: 'center', fontSize: 12, marginTop: 18 },
  flash: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff' },
});
