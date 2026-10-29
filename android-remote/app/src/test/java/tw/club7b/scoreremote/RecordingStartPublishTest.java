package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import java.time.Instant;
import org.junit.Test;

public final class RecordingStartPublishTest {
    private static final long NOW = Instant.parse("2026-10-29T09:00:00.000Z").toEpochMilli();
    private static final long EARLY = Instant.parse("2026-10-28T17:20:54.801Z").toEpochMilli();
    private static final long LATE = Instant.parse("2026-10-28T20:10:29.984Z").toEpochMilli();
    private static final long PREVIOUS_DAY = Instant.parse("2026-10-28T10:00:00.000Z").toEpochMilli();

    @Test public void keepsTheEarliestStartOfTheLatestRecordingDay() {
        assertEquals(EARLY, RecordingUploadStore.chooseRecordingStart(NOW, LATE, 0L, new long[] {EARLY, LATE}));
    }

    @Test public void doesNotPublishAgainAfterTheEarliestStartWasSent() {
        assertEquals(0L, RecordingUploadStore.chooseRecordingStart(NOW, EARLY, EARLY, new long[] {EARLY, LATE}));
    }

    @Test public void republishesWhenAnEarlierFileIsStillOnThePhone() {
        assertEquals(EARLY, RecordingUploadStore.chooseRecordingStart(NOW, LATE, LATE, new long[] {EARLY, LATE}));
    }

    @Test public void usesTodayWhenYesterdayIsAlsoInsideTheRefreshWindow() {
        assertEquals(EARLY, RecordingUploadStore.chooseRecordingStart(NOW, PREVIOUS_DAY, 0L, new long[] {EARLY}));
    }

    @Test public void ignoresAStartOlderThanTheTimelineRefreshWindow() {
        long ancient = NOW - RecordingUploadStore.TIMELINE_REFRESH_MS - 1L;
        assertEquals(0L, RecordingUploadStore.chooseRecordingStart(NOW, ancient, 0L, new long[] {ancient}));
    }
}
