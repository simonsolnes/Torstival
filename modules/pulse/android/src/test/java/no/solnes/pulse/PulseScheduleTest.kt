package no.solnes.pulse

import org.junit.Assert.*
import org.junit.Test

class PulseScheduleTest {
  @Test fun firstPulseWaitsOneInterval() {
    assertEquals(3500L, PulseSchedule(2500, 1000).deadline)
  }
  @Test fun lateCallbacksDoNotAccumulateDrift() {
    val schedule = PulseSchedule(1000, 0)
    schedule.advance(1050)
    assertEquals(2000L, schedule.deadline)
    schedule.advance(2010)
    assertEquals(3000L, schedule.deadline)
  }
  @Test fun sleepSkipsMissedPulsesWithoutABurst() {
    val schedule = PulseSchedule(1000, 0)
    schedule.advance(9500)
    assertEquals(10000L, schedule.deadline)
  }
  @Test fun invalidIntervalsAreRejected() {
    for (interval in listOf(-1L, 0L, 999L, 3_600_001L)) {
      assertThrows(IllegalArgumentException::class.java) { PulseSchedule(interval, 0) }
    }
  }
}
