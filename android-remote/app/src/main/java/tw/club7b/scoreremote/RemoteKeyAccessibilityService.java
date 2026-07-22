package tw.club7b.scoreremote;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

public final class RemoteKeyAccessibilityService extends AccessibilityService {
    private static final long MISSING_KEY_UP_DELAY_MS = 800L;
    private static final long ACTION_DEBOUNCE_MS = 240L;

    private final VolumeKeyInterpreter backgroundKeys = new VolumeKeyInterpreter();
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private BackgroundScoreController scoreController;
    private Runnable pendingLongPress;
    private Runnable pendingKeyFallback;
    private long lastActionAt;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = getServiceInfo();
        if (info == null) return;
        info.flags |= AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS;
        setServiceInfo(info);
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        if (!VolumeKeyInterpreter.isSupportedRemoteKey(event.getKeyCode())) return false;
        if (RemoteKeyRelay.dispatch(event)) return true;
        if (!RemoteSessionStore.isRecordingEnabled(this)) return false;
        return handleBackgroundKeyEvent(event);
    }

    private boolean handleBackgroundKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        VolumeKeyInterpreter.Action action = VolumeKeyInterpreter.Action.NONE;
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            action = backgroundKeys.onKeyDown(keyCode, event.getEventTime(), event.getRepeatCount());
            if (event.getRepeatCount() == 0) {
                vibrate(18L);
                scheduleLongPress(keyCode, event.getEventTime());
                scheduleMissingKeyUpFallback(keyCode);
            }
            if (action == VolumeKeyInterpreter.Action.UNDO) {
                cancelLongPress();
                cancelMissingKeyUpFallback();
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            cancelLongPress();
            cancelMissingKeyUpFallback();
            action = backgroundKeys.onKeyUp(keyCode, event.getEventTime());
        }
        if (action != VolumeKeyInterpreter.Action.NONE) sendBackgroundAction(action);
        return true;
    }

    private void scheduleLongPress(int keyCode, long pressedAt) {
        cancelLongPress();
        pendingLongPress = () -> {
            pendingLongPress = null;
            VolumeKeyInterpreter.Action action = backgroundKeys.onLongPressTimeout(
                    keyCode,
                    pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS
            );
            if (action == VolumeKeyInterpreter.Action.NONE) return;
            cancelMissingKeyUpFallback();
            sendBackgroundAction(action);
        };
        keyHandler.postDelayed(pendingLongPress, VolumeKeyInterpreter.LONG_PRESS_MS);
    }

    private void scheduleMissingKeyUpFallback(int keyCode) {
        cancelMissingKeyUpFallback();
        pendingKeyFallback = () -> {
            pendingKeyFallback = null;
            VolumeKeyInterpreter.Action action = backgroundKeys.onMissingKeyUp(keyCode);
            if (action != VolumeKeyInterpreter.Action.NONE) sendBackgroundAction(action);
        };
        keyHandler.postDelayed(pendingKeyFallback, MISSING_KEY_UP_DELAY_MS);
    }

    private void cancelLongPress() {
        if (pendingLongPress == null) return;
        keyHandler.removeCallbacks(pendingLongPress);
        pendingLongPress = null;
    }

    private void cancelMissingKeyUpFallback() {
        if (pendingKeyFallback == null) return;
        keyHandler.removeCallbacks(pendingKeyFallback);
        pendingKeyFallback = null;
    }

    private void sendBackgroundAction(VolumeKeyInterpreter.Action action) {
        long now = SystemClock.uptimeMillis();
        if (now - lastActionAt < ACTION_DEBOUNCE_MS) return;
        lastActionAt = now;
        if (scoreController == null) {
            try {
                scoreController = new BackgroundScoreController(this);
            } catch (RuntimeException error) {
                Toast.makeText(this, "無法啟動比分同步，請回 App 重新開啟", Toast.LENGTH_SHORT).show();
                vibrate(28L);
                return;
            }
        }
        scoreController.submit(action, (success, message, completedAction) -> keyHandler.post(() -> {
            Toast.makeText(RemoteKeyAccessibilityService.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? (completedAction == VolumeKeyInterpreter.Action.UNDO ? 100L : 55L) : 28L);
        }));
    }

    private void vibrate(long milliseconds) {
        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
            vibrator = manager == null ? null : manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // This service only filters remote-control keys and never reads screen content.
    }

    @Override
    public void onInterrupt() {
        // No accessibility feedback is produced.
    }

    @Override
    public void onDestroy() {
        cancelLongPress();
        cancelMissingKeyUpFallback();
        super.onDestroy();
    }
}
