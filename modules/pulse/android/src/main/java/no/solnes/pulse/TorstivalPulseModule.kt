package no.solnes.pulse

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TorstivalPulseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TorstivalPulse")
    Function("getState") { PulseService.snapshot() }
    Function("hasTorch") {
      appContext.reactContext?.let { PulseHardware(it).hasTorch() } ?: false
    }
    AsyncFunction("start") { intervalMs: Double, vibrate: Boolean, torch: Boolean, sound: Boolean, screen: Boolean ->
      require(intervalMs.isFinite() && intervalMs in 1000.0..3_600_000.0)
      val activity = appContext.currentActivity ?: error("Open Torstival before starting an interval.")
      // Permission results may arrive before window focus returns. Android
      // enforces the foreground-start restriction; focus is not a visibility test.
      check(!activity.isFinishing && !activity.isDestroyed) { "Open Torstival before starting an interval." }
      val intent = Intent(activity, PulseService::class.java).setAction(PulseService.START)
        .putExtra("intervalMs", intervalMs.toLong()).putExtra("vibrate", vibrate).putExtra("torch", torch)
        .putExtra("sound", sound).putExtra("screen", screen)
      if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
      Unit
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("updateOptions") { vibrate: Boolean, torch: Boolean, sound: Boolean, screen: Boolean ->
      PulseService.instance?.updateOptions(vibrate, torch, sound, screen)
      PulseService.snapshot()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") {
      appContext.reactContext?.stopService(Intent(appContext.reactContext, PulseService::class.java))
      Unit
    }.runOnQueue(Queues.MAIN)
  }
}
