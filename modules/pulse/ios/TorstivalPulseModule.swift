import ExpoModulesCore
import AVFoundation
import UIKit

public final class TorstivalPulseModule: Module {
  private var pendingOff: DispatchWorkItem?
  private var device: AVCaptureDevice?

  public func definition() -> ModuleDefinition {
    Name("TorstivalPulse")
    Function("hasTorch") { AVCaptureDevice.default(for: .video)?.hasTorch ?? false }
    AsyncFunction("requestTorchPermission") { (promise: Promise) in
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
    }
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
    AsyncFunction("stop") { self.turnOff() }.runOnQueue(.main)
    OnAppEntersBackground { DispatchQueue.main.async { self.turnOff() } }
    OnDestroy { DispatchQueue.main.async { self.turnOff() } }
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
