import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { formatCountdown } from './src/interval';
import { usePulse } from './src/usePulse';

function KeepScreenAwake() {
  useKeepAwake();
  return null;
}

export default function App() {
  const { value, setValue, intervalMs, running, flashing, remainingMs, vibrate, setVibrate,
    torch, setTorch, busy, message, active, start, stop } = usePulse();

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style={flashing ? 'dark' : 'light'} />
        {running && active && <KeepScreenAwake />}
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Text style={styles.brand}>TORSTIVAL</Text>
              <View style={styles.badge}>
                <View style={[styles.dot, running && styles.dotActive]} />
                <Text style={styles.badgeText}>{running ? 'RUNNING' : 'READY'}</Text>
              </View>
            </View>
            <View style={styles.main}>
              <Text style={styles.eyebrow}>A SIMPLE VISUAL BEAT</Text>
              <Text style={styles.title}>Set the pace.</Text>
              <Text style={styles.subtitle}>Light and vibration. Every interval.</Text>
              <View style={styles.card}>
                <Text style={styles.label}>{running ? 'NEXT PULSE IN' : 'INTERVAL'}</Text>
                <View style={styles.inputRow}>
                  {running ? <Text style={[styles.input, styles.inputDisabled]} testID="countdown-value"
                    numberOfLines={1} adjustsFontSizeToFit
                    accessibilityLabel={`Next pulse in ${formatCountdown(remainingMs)} seconds`}>
                    {formatCountdown(remainingMs)}
                  </Text> : <TextInput
                    accessibilityLabel="Interval in seconds"
                    accessibilityHint="Enter a number from 1 to 3600"
                    testID="interval-input"
                    style={[styles.input, running && styles.inputDisabled]}
                    value={value}
                    onChangeText={setValue}
                    editable={!running && !busy}
                    keyboardType="decimal-pad"
                    maxLength={8}
                    selectTextOnFocus
                    selectionColor="#c4b5fd"
                  />}
                  <Text style={styles.unit}>seconds</Text>
                </View>
                <View style={styles.rule} />
                <Text style={styles.helper} accessibilityLiveRegion="polite">
                  {intervalMs === null ? 'Enter a value from 1 to 3600 seconds.' : running ? `Repeats every ${intervalMs / 1000} seconds.` : 'Choose any interval from 1 to 3600 seconds.'}
                </Text>
              </View>
              <View style={styles.options}>
                <View style={styles.option}>
                  <Text style={styles.optionText}>Vibration</Text>
                  <Switch accessibilityLabel="Vibration" value={vibrate} onValueChange={setVibrate}
                    disabled={running || busy} trackColor={{ true: '#8c75d2', false: '#343842' }} />
                </View>
                <View style={styles.option}>
                  <Text style={styles.optionText}>Flashlight</Text>
                  <Switch accessibilityLabel="Flashlight" value={torch} onValueChange={setTorch}
                    disabled={running || busy} trackColor={{ true: '#8c75d2', false: '#343842' }} />
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={running ? 'Stop flashing' : 'Start flashing'}
                accessibilityState={{ disabled: busy || (!running && intervalMs === null), busy }}
                testID="toggle-button"
                disabled={busy || (!running && intervalMs === null)}
                onPress={() => { Keyboard.dismiss(); void (running ? stop() : start()); }}
                style={({ pressed }) => [styles.button, running && styles.stopButton, !running && intervalMs === null && styles.disabledButton, pressed && styles.pressed]}
              >
                <Text style={[styles.buttonText, running && styles.stopButtonText]}>{busy ? 'Please wait…' : running ? '■   Stop' : '▶   Start'}</Text>
              </Pressable>
              <Text style={styles.note}>{Platform.OS === 'android'
                ? 'Keeps pulsing in the background. Stop here or from the notification.'
                : 'Keep this screen open. Leaving the app stops the pulses.'}</Text>
              {message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
            </View>
            <Text style={styles.footer}>JUST YOU AND THE RHYTHM.</Text>
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#20232b', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#818794' },
  dotActive: { backgroundColor: '#c4b5fd' },
  badgeText: { color: '#b9bec9', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  main: { flex: 1, justifyContent: 'center', paddingVertical: 28 },
  eyebrow: { color: '#c4b5fd', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 16 },
  title: { color: '#f4f1e9', fontSize: 42, letterSpacing: -1.8, fontWeight: '700' },
  subtitle: { color: '#9bA1ae', fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 24 },
  card: { borderRadius: 24, backgroundColor: '#1c1f26', borderWidth: 1, borderColor: '#30343e', padding: 24 },
  label: { color: '#a5abb7', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, gap: 12 },
  input: { color: '#f4f1e9', fontSize: 64, fontWeight: '500', minWidth: 60, flexShrink: 1, padding: 0, fontVariant: ['tabular-nums'] },
  inputDisabled: { color: '#c4b5fd' },
  unit: { color: '#a5abb7', fontSize: 17 },
  rule: { height: 1, backgroundColor: '#343842', marginVertical: 20 },
  helper: { color: '#a5abb7', fontSize: 12, lineHeight: 19 },
  options: { marginTop: 12, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  optionText: { color: '#d5d1df', fontSize: 15 },
  message: { color: '#f0c98c', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  button: { backgroundColor: '#c4b5fd', borderRadius: 18, minHeight: 64, justifyContent: 'center', alignItems: 'center', marginTop: 20, padding: 16 },
  stopButton: { backgroundColor: '#292333', borderWidth: 1, borderColor: '#77658d' },
  buttonText: { color: '#211a32', fontSize: 18, fontWeight: '700' },
  stopButtonText: { color: '#e0d4f7' },
  disabledButton: { opacity: 0.35 },
  pressed: { opacity: 0.75 },
  note: { color: '#a5abb7', textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 18 },
  footer: { color: '#777e8b', fontSize: 9, letterSpacing: 2, textAlign: 'center', paddingBottom: 8 },
  flash: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff' },
});
