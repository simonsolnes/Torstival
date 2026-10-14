package no.solnes.pulse

internal class PulseSchedule(val intervalMs: Long, now: Long) {
  init { require(intervalMs in 1000L..3_600_000L) }
  var deadline = now + intervalMs
    private set

  fun advance(now: Long) {
    deadline += ((maxOf(0, now - deadline) / intervalMs) + 1) * intervalMs
  }
}
