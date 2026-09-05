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
    private static final long MISSING_KEY_UP_DELAY_MS = 575L;
    private static final long ACTION_DEBOUNCE_MS = 300L;
    private static final long UNDO_DEBOUNCE_MS = 600L;
    private static final long DOUBLE_PRESS_MS = 400L;
    private static final long SHUTTLE_PRESS_COOLDOWN_MS = 2000L;

    private final VolumeKeyInterpreter backgroundKeys = new VolumeKeyInterpreter();
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private BackgroundScoreController scoreController;
    private Runnable pendingLongPress;
    private Runnable pendingKeyFallback;
    private Runnable pendingShortPress;
    private int pendingShortPressKey = KeyEvent.KEYCODE_UNKNOWN;
    private long pendingShortPressAt;
    private long lastShuttleActionAt;
    private int pendingShortPressCount;
    private VolumeKeyInterpreter.Action pendingShortPressAction = VolumeKeyInterpreter.Action.NONE;
    private long lastPointActionAt;
    private long lastUndoActionAt;

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
        if (action != VolumeKeyInterpreter.Action.NONE) handleResolvedBackgroundAction(action, keyCode, event.getEventTime());
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
            handleResolvedBackgroundAction(action, keyCode, pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS);
        };
        keyHandler.postDelayed(pendingLongPress, VolumeKeyInterpreter.LONG_PRESS_MS);
    }

    private void scheduleMissingKeyUpFallback(int keyCode) {
        cancelMissingKeyUpFallback();
        pendingKeyFallback = () -> {
            pendingKeyFallback = null;
            VolumeKeyInterpreter.Action action = backgroundKeys.onMissingKeyUp(keyCode);
            if (action != VolumeKeyInterpreter.Action.NONE) handleResolvedBackgroundAction(action, keyCode, SystemClock.uptimeMillis());
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

    private void handleResolvedBackgroundAction(VolumeKeyInterpreter.Action action, int keyCode, long eventTime) {
        if (action == VolumeKeyInterpreter.Action.UNDO) {
            cancelPendingShortPress();
            sendBackgroundAction(action);
            return;
        }
        if (pendingShortPress == null || pendingShortPressKey != keyCode || eventTime - pendingShortPressAt > DOUBLE_PRESS_MS) {
            cancelPendingShortPress();pendingShortPressKey = keyCode;pendingShortPressCount = 0;pendingShortPressAction = action;
        }
        pendingShortPressCount++;pendingShortPressAt = eventTime;
        if (pendingShortPress != null) keyHandler.removeCallbacks(pendingShortPress);
        pendingShortPress = () -> {
            int count=pendingShortPressCount;VolumeKeyInterpreter.Action resolved=pendingShortPressAction;
            cancelPendingShortPress();
            if(count==1)sendBackgroundAction(resolved);else if(count==2)sendBackgroundFullscreenCommand();else if(count==3){
                long now=SystemClock.uptimeMillis();
                if(now-lastShuttleActionAt>=SHUTTLE_PRESS_COOLDOWN_MS){lastShuttleActionAt=now;sendBackgroundUseShuttle();}
            }
        };
        keyHandler.postDelayed(pendingShortPress, DOUBLE_PRESS_MS);
    }

    private void cancelPendingShortPress() {
        if (pendingShortPress != null) keyHandler.removeCallbacks(pendingShortPress);
        pendingShortPress = null;
        pendingShortPressKey = KeyEvent.KEYCODE_UNKNOWN;
        pendingShortPressAt = 0L;
        pendingShortPressCount = 0;
        pendingShortPressAction = VolumeKeyInterpreter.Action.NONE;
    }

    private BackgroundScoreController scoreController() {
        if (scoreController == null) scoreController = new BackgroundScoreController(this);
        return scoreController;
    }

    private void sendBackgroundFullscreenCommand() {
        try {
            scoreController().toggleScoreFullscreen((success, message) -> keyHandler.post(() -> {
                Toast.makeText(RemoteKeyAccessibilityService.this, message, Toast.LENGTH_SHORT).show();
                vibrate(success ? 70L : 28L);
            }));
        } catch (RuntimeException error) {
            Toast.makeText(this, "無法連接計分模式", Toast.LENGTH_SHORT).show();
            vibrate(28L);
        }
    }

    private void sendBackgroundUseShuttle() {
        try {
            scoreController().useOneShuttle((success,message) -> keyHandler.post(() -> {
                Toast.makeText(RemoteKeyAccessibilityService.this,message,Toast.LENGTH_SHORT).show();
                vibrate(success ? 120L : 28L);
            }));
        } catch (RuntimeException error) {
            Toast.makeText(this,"無法連接球桶管理",Toast.LENGTH_SHORT).show();vibrate(28L);
        }
    }

    private void sendBackgroundAction(VolumeKeyInterpreter.Action action) {
        long now = SystemClock.uptimeMillis();
        if (action == VolumeKeyInterpreter.Action.UNDO) {
            if (now - lastUndoActionAt < UNDO_DEBOUNCE_MS) return;
            lastUndoActionAt = now;
        } else {
            if (now - lastPointActionAt < ACTION_DEBOUNCE_MS) return;
            lastPointActionAt = now;
        }
        if (scoreController == null) {
            try {
                scoreController = scoreController();
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
        cancelPendingShortPress();
        super.onDestroy();
    }
}
