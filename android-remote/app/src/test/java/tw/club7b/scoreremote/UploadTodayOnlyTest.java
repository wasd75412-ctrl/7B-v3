package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import org.junit.Test;

public final class UploadTodayOnlyTest {
    private static final long TODAY = Instant.parse("2026-10-16T04:00:00.000Z").toEpochMilli();
    private static final long YESTERDAY = Instant.parse("2026-10-15T04:00:00.000Z").toEpochMilli();

    private static RecordingUploadStore.Entry waiting(long startMs) {
        RecordingUploadStore.Entry entry = new RecordingUploadStore.Entry();
        entry.startMs = startMs;
        entry.status = RecordingUploadStore.Status.WAITING;
        return entry;
    }

    @Test public void sameDayUsesTaipeiCalendar() {
        assertTrue(RecordingTimeline.sameDay(TODAY, TODAY + 3_600_000L));
        assertFalse(RecordingTimeline.sameDay(YESTERDAY, TODAY));
    }

    @Test public void autoUploadSkipsOlderWaitingClips() {
        assertTrue(waiting(TODAY).mayAutoUpload(TODAY));
        assertFalse(waiting(YESTERDAY).mayAutoUpload(TODAY));
    }

    @Test public void forcedOrInProgressOlderClipsStillUpload() {
        RecordingUploadStore.Entry forced = waiting(YESTERDAY);
        forced.forceUpload = true;
        assertTrue(forced.mayAutoUpload(TODAY));

        RecordingUploadStore.Entry uploading = waiting(YESTERDAY);
        uploading.status = RecordingUploadStore.Status.UPLOADING;
        assertTrue(uploading.mayAutoUpload(TODAY));

        RecordingUploadStore.Entry resumed = waiting(YESTERDAY);
        resumed.sessionUrl = "https://example/session";
        assertTrue(resumed.mayAutoUpload(TODAY));
    }
}
