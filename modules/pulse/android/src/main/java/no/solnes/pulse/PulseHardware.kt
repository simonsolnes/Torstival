package no.solnes.pulse

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator

internal class PulseHardware(context: Context) {
  private val cameras = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  @Suppress("DEPRECATION")
  private val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
  private var torchId: String? = null
  private var torchOn = false
  private var tone: ToneGenerator? = null

  fun hasTorch(): Boolean = findTorch() != null

  private fun findTorch(): String? = try {
    cameras.cameraIdList.firstOrNull { id ->
      val camera = cameras.getCameraCharacteristics(id)
      camera.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
        camera.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    }
  } catch (_: Exception) { null }

  fun pulse(vibrate: Boolean, torch: Boolean, sound: Boolean): String? {
    var warning: String? = null
    if (vibrate) {
      try {
        if (vibrator.hasVibrator()) {
          val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
          if (Build.VERSION.SDK_INT >= 26) {
            vibrator.vibrate(VibrationEffect.createOneShot(450, 255), attributes)
          } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(450, attributes)
          }
        } else warning = "Enheten har ingen vibrasjonsmotor."
      } catch (_: Exception) { warning = "Vibrasjon er utilgjengelig. Sjekk enhetsinnstillingene." }
    }
    if (torch) {
      try {
        val id = torchId ?: findTorch()?.also { torchId = it }
        if (id == null) warning = "Enheten har ingen lommelykt på baksiden."
        else { cameras.setTorchMode(id, true); torchOn = true }
      } catch (_: Exception) { warning = "Lommelykten er utilgjengelig. En annen app kan bruke den." }
    }
    if (sound) {
      try {
        val generator = tone ?: ToneGenerator(AudioManager.STREAM_MUSIC, 85).also { tone = it }
        if (!generator.startTone(ToneGenerator.TONE_PROP_BEEP, 180)) warning = "Lyd er utilgjengelig."
      } catch (_: Exception) { warning = "Lyd er utilgjengelig. Sjekk medievolumet." }
    }
    return warning
  }

  fun torchOff() {
    if (!torchOn) return
    try { torchId?.let { cameras.setTorchMode(it, false) }; torchOn = false }
    catch (_: Exception) { /* The OS can take the camera away; retry at stop. */ }
  }

  fun disableOutputs(vibrate: Boolean, torch: Boolean, sound: Boolean) {
    if (!torch) torchOff()
    if (!vibrate) vibrator.cancel()
    if (!sound) {
      tone?.stopTone()
      tone?.release()
      tone = null
    }
  }

  fun stop() = disableOutputs(false, false, false)
}
