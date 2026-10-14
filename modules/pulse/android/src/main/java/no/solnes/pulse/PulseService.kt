package no.solnes.pulse

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*

internal data class PulseState(
  val running: Boolean = false,
  val intervalMs: Long = 300_000,
  val deadline: Long = 0,
  val lastPulse: Long = -1,
  val pulseCount: Long = 0,
  val vibrate: Boolean = true,
  val torch: Boolean = true,
  val sound: Boolean = true,
  val screen: Boolean = true,
  val warning: String? = null
)

class PulseService : Service() {
  companion object {
    const val START = "no.solnes.pulse.START"
    const val STOP = "no.solnes.pulse.STOP"
    const val NOTIFICATION_ID = 4101
    private const val CHANNEL = "torstival-interval"
    @Volatile internal var state = PulseState()
    // Accessed only on the main queue; settings updates never create a service.
    internal var instance: PulseService? = null

    fun snapshot(): Map<String, Any?> {
      val current = state
      val now = SystemClock.elapsedRealtime()
      return mapOf(
        "running" to current.running,
        "intervalMs" to current.intervalMs,
        "remainingMs" to if (current.running) maxOf(0, current.deadline - now) else 0,
        "flashing" to (current.running && current.screen && current.lastPulse >= 0 && now - current.lastPulse < 120),
        "vibrate" to current.vibrate,
        "torch" to current.torch,
        "sound" to current.sound,
        "screen" to current.screen,
        "warning" to current.warning
      )
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var hardware: PulseHardware
  private var wakeLock: PowerManager.WakeLock? = null
  private var schedule: PulseSchedule? = null
  private val torchOff = Runnable { hardware.torchOff() }
  private val beat = object : Runnable {
    override fun run() {
      val timer = schedule ?: return
      val now = SystemClock.elapsedRealtime()
      timer.advance(now)
      state = state.copy(lastPulse = now, deadline = timer.deadline, pulseCount = state.pulseCount + 1)
      val warning = hardware.pulse(state.vibrate, state.torch, state.sound)
      if (warning != null) state = state.copy(warning = warning)
      handler.postDelayed(torchOff, 120)
      handler.postDelayed(this, maxOf(1, timer.deadline - SystemClock.elapsedRealtime()))
    }
  }

  override fun onCreate() {
    super.onCreate()
    hardware = PulseHardware(this)
    instance = this
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL, "Running interval", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Shows when your interval is running and lets you stop it."
      channel.setSound(null, null)
      channel.enableVibration(false)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != START) { finish(); return START_NOT_STICKY }
    clearPulse()
    try {
      val intervalMs = intent.getLongExtra("intervalMs", 0)
      val timer = PulseSchedule(intervalMs, SystemClock.elapsedRealtime())
      val requestedTorch = intent.getBooleanExtra("torch", true)
      val torch = requestedTorch && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
      state = PulseState(intervalMs = intervalMs, vibrate = intent.getBooleanExtra("vibrate", true), torch = torch,
        sound = intent.getBooleanExtra("sound", true),
        screen = intent.getBooleanExtra("screen", true),
        warning = if (requestedTorch && !torch) "Camera permission is needed for the flashlight." else null)
      promoteForeground(torch)
      wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Torstival:Interval").apply {
          setReferenceCounted(false)
          // Deliberately held for the user-started session, released in every stop/destroy path.
          acquire()
        }
      schedule = timer
      state = state.copy(running = true, deadline = timer.deadline)
      handler.postDelayed(beat, maxOf(1, timer.deadline - SystemClock.elapsedRealtime()))
    } catch (_: Exception) {
      state = state.copy(warning = "Could not start the interval. Open the app and try again.")
      finish()
    }
    // Never silently restart after force-stop, process death, or a reboot.
    return START_NOT_STICKY
  }

  internal fun updateOptions(vibrate: Boolean, requestedTorch: Boolean, sound: Boolean, screen: Boolean) {
    if (!state.running) return
    var torch = requestedTorch && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    var warning: String? = if (requestedTorch && !torch) "Camera permission is needed for the flashlight." else null
    if (torch != state.torch) {
      try {
        // Add camera access while the activity is visible, without replacing the timer.
        promoteForeground(torch)
      } catch (_: Exception) {
        torch = false
        warning = "Flashlight unavailable. Open the app and try again."
      }
    }
    hardware.disableOutputs(vibrate, torch, sound)
    state = state.copy(vibrate = vibrate, torch = torch, sound = sound, screen = screen, warning = warning)
  }

  private fun promoteForeground(torch: Boolean) {
    val notification = notification()
    if (Build.VERSION.SDK_INT >= 34) {
      val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or
        (if (torch) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)
      startForeground(NOTIFICATION_ID, notification, type)
    } else if (Build.VERSION.SDK_INT >= 29) {
      val type = if (Build.VERSION.SDK_INT >= 30 && torch) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0
      startForeground(NOTIFICATION_ID, notification, type)
    } else startForeground(NOTIFICATION_ID, notification)
  }

  private fun notification(): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val stop = PendingIntent.getService(this, 1, Intent(this, PulseService::class.java).setAction(STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle("Torstival is running")
      .setContentText("Pulse every ${state.intervalMs / 1000.0} seconds • Tap Stop to finish")
      .setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_SERVICE)
      .addAction(Notification.Action.Builder(null, "Stop", stop).build())
      .build()
  }

  private fun clearPulse() {
    handler.removeCallbacksAndMessages(null)
    schedule = null
    hardware.stop()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    state = state.copy(running = false, deadline = 0, lastPulse = -1)
  }

  private fun finish() { clearPulse(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
  override fun onDestroy() { clearPulse(); if (instance === this) instance = null; super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null
}
