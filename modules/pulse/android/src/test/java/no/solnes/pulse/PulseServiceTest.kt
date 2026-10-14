package no.solnes.pulse

import android.app.Application
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Looper
import android.os.PowerManager
import android.os.Vibrator
import org.robolectric.shadows.ShadowToneGenerator
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.android.controller.ServiceController
import org.robolectric.shadows.ShadowPowerManager
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 36], application = Application::class)
@LooperMode(LooperMode.Mode.PAUSED)
class PulseServiceTest {
  private lateinit var controller: ServiceController<PulseService>
  private lateinit var service: PulseService

  @Before fun setup() {
    PulseService.state = PulseState()
    controller = Robolectric.buildService(PulseService::class.java).create()
    service = controller.get()
  }
  @After fun cleanup() { controller.destroy() }

  private fun start(interval: Long = 1000, torch: Boolean = false, sound: Boolean = false, vibrate: Boolean = false, screen: Boolean = true): Int = service.onStartCommand(
    Intent(service, PulseService::class.java).setAction(PulseService.START)
      .putExtra("intervalMs", interval).putExtra("vibrate", vibrate).putExtra("torch", torch)
      .putExtra("sound", sound).putExtra("screen", screen), 0, 1)

  @Test fun screenOffStillRunsTheTimerAndOtherOutputs() {
    start(screen = false, sound = true)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    assertEquals(1L, PulseService.state.pulseCount)
    assertEquals(false, PulseService.snapshot()["screen"])
    assertEquals(false, PulseService.snapshot()["flashing"])
    assertEquals(1, ShadowToneGenerator.getPlayedTones().size)
  }

  @Test fun liveSettingsPreserveDeadlineAndWakeLockAndCancelDisabledFeedback() {
    val vibrator = shadowOf(service.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    vibrator.setHasVibrator(true)
    start()
    val deadline = PulseService.state.deadline
    val wakeLock = ShadowPowerManager.getLatestWakeLock()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
    service.updateOptions(vibrate = true, requestedTorch = false, sound = true, screen = false)
    assertEquals(deadline, PulseService.state.deadline)
    assertSame(wakeLock, ShadowPowerManager.getLatestWakeLock())
    assertTrue(wakeLock.isHeld)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
    assertEquals(1L, PulseService.state.pulseCount)
    assertTrue(vibrator.isVibrating)
    assertEquals(1, ShadowToneGenerator.getPlayedTones().size)
    assertEquals(false, PulseService.snapshot()["flashing"])
    service.updateOptions(vibrate = false, requestedTorch = false, sound = false, screen = true)
    assertFalse(vibrator.isVibrating)
    assertEquals(true, PulseService.snapshot()["flashing"])
    service.updateOptions(vibrate = false, requestedTorch = false, sound = false, screen = false)
    assertEquals(false, PulseService.snapshot()["flashing"])
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    assertEquals(2L, PulseService.state.pulseCount)
    assertEquals(1, ShadowToneGenerator.getPlayedTones().size)
    assertFalse(vibrator.isVibrating)
    assertEquals(deadline + 2000, PulseService.state.deadline)
  }

  @Test fun enablingTorchAddsCameraServiceTypeWithoutRestartingTheTimer() {
    start()
    val deadline = PulseService.state.deadline
    shadowOf(service.application).grantPermissions(android.Manifest.permission.CAMERA)
    service.updateOptions(vibrate = false, requestedTorch = true, sound = false, screen = true)
    assertTrue(PulseService.state.torch)
    assertEquals(deadline, PulseService.state.deadline)
    if (Build.VERSION.SDK_INT >= 30) {
      assertTrue(service.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA != 0)
    }
    shadowOf(service.application).denyPermissions(android.Manifest.permission.CAMERA)
    service.updateOptions(vibrate = true, requestedTorch = true, sound = false, screen = false)
    assertFalse(PulseService.state.torch)
    assertTrue(PulseService.state.running)
    assertEquals(deadline, PulseService.state.deadline)
    assertNotNull(PulseService.state.warning)
  }

  @Test fun settingsUpdateAfterStopNeverRestartsTheService() {
    start()
    service.onStartCommand(Intent(service, PulseService::class.java).setAction(PulseService.STOP), 0, 2)
    service.updateOptions(vibrate = true, requestedTorch = false, sound = true, screen = true)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(5))
    assertFalse(PulseService.state.running)
    assertEquals(0L, PulseService.state.pulseCount)
    assertTrue(ShadowToneGenerator.getPlayedTones().isEmpty())
    assertFalse(ShadowPowerManager.getLatestWakeLock().isHeld)
    service.onDestroy()
    assertNull(PulseService.instance)
  }

  @Test fun soundFollowsTheNativeCadenceAndStopsWithTheSession() {
    start(sound = true)
    assertEquals(true, PulseService.snapshot()["sound"])
    assertTrue(ShadowToneGenerator.getPlayedTones().isEmpty())
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    assertEquals(1, ShadowToneGenerator.getPlayedTones().size)
    assertEquals(Duration.ofMillis(180), ShadowToneGenerator.getPlayedTones().single().duration())
    service.onStartCommand(Intent(service, PulseService::class.java).setAction(PulseService.STOP), 0, 2)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(5))
    assertEquals(1, ShadowToneGenerator.getPlayedTones().size)
  }

  @Test fun soundOffStaysSilentAndIsRestoredInTheSnapshot() {
    start(sound = false)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(3))
    assertEquals(false, PulseService.snapshot()["sound"])
    assertTrue(ShadowToneGenerator.getPlayedTones().isEmpty())
  }

  @Test fun strongerVibrationLasts450MillisecondsAndStopCancelsIt() {
    val vibrator = shadowOf(service.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    vibrator.setHasVibrator(true)
    start(vibrate = true)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    assertTrue(vibrator.isVibrating)
    assertEquals(450L, vibrator.milliseconds)
    service.onStartCommand(Intent(service, PulseService::class.java).setAction(PulseService.STOP), 0, 2)
    assertFalse(vibrator.isVibrating)
    assertTrue(vibrator.isCancelled)
  }

  @Test fun timerRunsWithoutAnyActivityOrJavascriptAndDoesNotAutoRestart() {
    assertEquals(Service.START_NOT_STICKY, start())
    assertTrue(PulseService.state.running)
    assertTrue(ShadowPowerManager.getLatestWakeLock().isHeld)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(999))
    assertEquals(0L, PulseService.state.pulseCount)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1))
    assertEquals(1L, PulseService.state.pulseCount)
    assertEquals(true, PulseService.snapshot()["flashing"])
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(120))
    assertEquals(false, PulseService.snapshot()["flashing"])
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(2880))
    assertEquals(4L, PulseService.state.pulseCount)
  }

  @Test fun notificationHasAStopActionThatReleasesTheWakeLockAndCancelsPulses() {
    start()
    val notifications = shadowOf(service.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
    val notification = notifications.getNotification(PulseService.NOTIFICATION_ID)
    assertNotNull(notification)
    assertEquals("Stopp", notification.actions.single().title)
    val stopIntent = shadowOf(notification.actions.single().actionIntent).savedIntent
    assertEquals(PulseService.STOP, stopIntent.action)
    service.onStartCommand(stopIntent, 0, 2)
    assertFalse(PulseService.state.running)
    assertFalse(ShadowPowerManager.getLatestWakeLock().isHeld)
    assertTrue(shadowOf(service).isStoppedBySelf)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(10))
    assertEquals(0L, PulseService.state.pulseCount)
  }

  @Test fun replacingTheIntervalCancelsTheOldCadence() {
    start(1000)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(500))
    start(2000)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1999))
    assertEquals(0L, PulseService.state.pulseCount)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(1))
    assertEquals(1L, PulseService.state.pulseCount)
  }

  @Test fun deniedCameraPermissionFallsBackToAnIntervalWithoutTorch() {
    shadowOf(service.application).denyPermissions(android.Manifest.permission.CAMERA)
    start(torch = true)
    assertTrue(PulseService.state.running)
    assertFalse(PulseService.state.torch)
    assertNotNull(PulseService.state.warning)
  }

  @Test fun destructionStopsEveryScheduledCallbackAndReleasesCpuLock() {
    start()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(1))
    service.onDestroy()
    assertFalse(PulseService.state.running)
    assertFalse(ShadowPowerManager.getLatestWakeLock().isHeld)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(10))
    assertEquals(1L, PulseService.state.pulseCount)
  }

  @Test fun invalidStartIsStoppedAndReportedWithoutCrashing() {
    start(0)
    assertFalse(PulseService.state.running)
    assertNotNull(PulseService.state.warning)
    assertTrue(shadowOf(service).isStoppedBySelf)
  }
}
