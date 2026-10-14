package no.solnes.pulse

import android.app.Application
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.os.PowerManager
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

  private fun start(interval: Long = 1000, torch: Boolean = false): Int = service.onStartCommand(
    Intent(service, PulseService::class.java).setAction(PulseService.START)
      .putExtra("intervalMs", interval).putExtra("vibrate", false).putExtra("torch", torch), 0, 1)

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
    assertEquals("Stop", notification.actions.single().title)
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
