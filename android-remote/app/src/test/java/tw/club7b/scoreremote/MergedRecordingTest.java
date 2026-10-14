package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.camera.video.VideoRecordEvent;
import org.junit.Test;

public final class MergedRecordingTest {
    private static RecordingUploadStore.Entry entry(long startMs, long endMs, RecordingUploadStore.Status status) {
        RecordingUploadStore.Entry entry = new RecordingUploadStore.Entry();
        entry.startMs = startMs;
        entry.endMs = endMs;
        entry.status = status;
        return entry;
    }

    @Test public void leavingTheCameraStillKeepsTheFootage() {
        assertTrue(FinishedRecording.keepsFootage(false, VideoRecordEvent.Finalize.ERROR_NONE));
        assertTrue(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE));
        assertTrue(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE));
        assertTrue(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED));
        assertTrue(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED));
    }

    @Test public void brokenFilesAreNotQueued() {
        assertFalse(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA));
        assertFalse(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_ENCODING_FAILED));
        assertFalse(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_RECORDER_ERROR));
        assertFalse(FinishedRecording.keepsFootage(true, VideoRecordEvent.Finalize.ERROR_UNKNOWN));
    }

    @Test public void mergedVideoReplacesOnlyTheWaitingPiecesItCovers() {
        long start = 1_000_000L, end = start + 8_000_000L;
        assertTrue(RecordingUploadStore.supersededBy(entry(start + 1_000L, start + 200_000L, RecordingUploadStore.Status.WAITING), start, end));
        assertTrue(RecordingUploadStore.supersededBy(entry(end - 600_000L, end + 30_000L, RecordingUploadStore.Status.FAILED), start, end));
        assertFalse(RecordingUploadStore.supersededBy(entry(start + 1_000L, start + 200_000L, RecordingUploadStore.Status.UPLOADED), start, end));
        assertFalse(RecordingUploadStore.supersededBy(entry(start - 600_000L, start + 200_000L, RecordingUploadStore.Status.WAITING), start, end));
        assertFalse(RecordingUploadStore.supersededBy(entry(end - 60_000L, end + 600_000L, RecordingUploadStore.Status.WAITING), start, end));
    }
}
