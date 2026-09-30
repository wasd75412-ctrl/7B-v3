package tw.club7b.scoreremote;

import android.os.Handler;
import android.os.Looper;

final class CameraButtonGesture {
    static final long DOUBLE_PRESS_MS = 500L;
    private static final CameraButtonGesture SHARED = new CameraButtonGesture();

    static CameraButtonGesture shared() {
        return SHARED;
    }

    interface Callbacks {
        void undo();
        void useShuttle();
        void returnShuttle();
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingUndo;
    private long lastShortPressAt = Long.MIN_VALUE;
    private long lastLongPressAt = Long.MIN_VALUE;

    void onShortPress(long eventTime, Callbacks callbacks) {
        if (eventTime == lastShortPressAt) return;
        lastShortPressAt = eventTime;
        if (pendingUndo != null) {
            handler.removeCallbacks(pendingUndo);
            pendingUndo = null;
            callbacks.useShuttle();
            return;
        }
        pendingUndo = () -> {
            pendingUndo = null;
            callbacks.undo();
        };
        handler.postDelayed(pendingUndo, DOUBLE_PRESS_MS);
    }

    void onLongPress(long eventTime, Callbacks callbacks) {
        if (eventTime == lastLongPressAt) return;
        lastLongPressAt = eventTime;
        if (pendingUndo != null) {
            handler.removeCallbacks(pendingUndo);
            pendingUndo = null;
        }
        callbacks.returnShuttle();
    }
}
