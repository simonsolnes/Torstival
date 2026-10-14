import ExpoModulesCore
import AVFoundation
import UIKit
import CoreHaptics
import AudioToolbox

public final class TorstivalPulseModule: Module {
  private var pendingOff: DispatchWorkItem?
  private var device: AVCaptureDevice?
  private var audio: AVAudioPlayer?
  private var haptics: CHHapticEngine?
  private var hapticPlayer: CHHapticPatternPlayer?

  public func definition() -> ModuleDefinition {
    Name("TorstivalPulse")
    Function("hasTorch") { AVCaptureDevice.default(for: .video)?.hasTorch ?? false }
    AsyncFunction("requestTorchPermission") { (promise: Promise) in
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
    }
    AsyncFunction("pulseFeedback") { (vibrate: Bool, sound: Bool) in
      guard UIApplication.shared.applicationState == .active else { return }
      if vibrate { self.vibrate() }
      if sound {
        if self.audio == nil {
          guard let url = Bundle.main.url(forResource: "torstival-beep", withExtension: "wav") else {
            throw NSError(domain: "TorstivalPulse", code: 1, userInfo: [NSLocalizedDescriptionKey: "Beep resource missing"])
          }
          // Respect the silent switch and mix with any existing audio.
          try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
          self.audio = try AVAudioPlayer(contentsOf: url)
        }
        self.audio?.currentTime = 0
        self.audio?.play()
      }
    }.runOnQueue(.main)
    AsyncFunction("pulseTorch") { () -> Bool in
      guard UIApplication.shared.applicationState == .active,
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
        let device = AVCaptureDevice.default(for: .video), device.hasTorch, device.isTorchAvailable else { return false }
      self.pendingOff?.cancel()
      do {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        try device.setTorchModeOn(level: 1.0)
        self.device = device
      } catch { return false }
      let off = DispatchWorkItem { [weak self] in self?.turnOff() }
      self.pendingOff = off
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(120), execute: off)
      return true
    }.runOnQueue(.main)
    AsyncFunction("stop") { self.stop() }.runOnQueue(.main)
    AsyncFunction("updateOptions") { (vibrate: Bool, torch: Bool, sound: Bool, screen: Bool) in
      if !torch { self.turnOff() }
      if !sound { self.audio?.stop() }
      if !vibrate { self.stopHaptics() }
    }.runOnQueue(.main)
    OnAppEntersBackground { DispatchQueue.main.async { self.stop() } }
    OnDestroy { DispatchQueue.main.async { self.stop() } }
  }

  private func vibrate() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
      AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
      return
    }
    do {
      if haptics == nil {
        haptics = try CHHapticEngine()
        haptics?.playsHapticsOnly = true
        haptics?.isAutoShutdownEnabled = true
      }
      try haptics?.start()
      let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
      ], relativeTime: 0, duration: 0.45)
      let pattern = try CHHapticPattern(events: [event], parameters: [])
      hapticPlayer = try haptics?.makePlayer(with: pattern)
      try hapticPlayer?.start(atTime: CHHapticTimeImmediate)
    } catch {
      haptics = nil
      AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
    }
  }

  private func stop() {
    turnOff()
    audio?.stop()
    stopHaptics()
  }

  private func stopHaptics() {
    try? hapticPlayer?.stop(atTime: CHHapticTimeImmediate)
    hapticPlayer = nil
    haptics?.stop(completionHandler: nil)
    haptics = nil
  }

  private func turnOff() {
    pendingOff?.cancel()
    pendingOff = nil
    guard let device = device else { return }
    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      device.torchMode = .off
      self.device = nil
    } catch { /* The camera may have been taken by the system. Retry on stop. */ }
  }
}
