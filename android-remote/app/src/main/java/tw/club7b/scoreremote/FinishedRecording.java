package tw.club7b.scoreremote;

import androidx.camera.video.VideoRecordEvent;

final class FinishedRecording {
    private FinishedRecording() { }

    // CameraX still closes the file properly for these stops, e.g. leaving the camera screen mid-session.
    static boolean keepsFootage(boolean hasError, int error) {
        if (!hasError) return true;
        return error == VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE
                || error == VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE
                || error == VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED
                || error == VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED;
    }
}
