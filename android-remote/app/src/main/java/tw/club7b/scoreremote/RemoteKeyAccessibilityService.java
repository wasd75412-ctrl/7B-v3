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
    private static final long MISSING_KEY_UP_DELAY_MS = 160L;
    private static final long SAME_POINT_ECHO_MS = 40L;
    private static final long UNDO_DEBOUNCE_MS = 600L;
    private static final long SHUTTLE_PRESS_COOLDOWN_MS = 2000L;

    private final VolumeKeyInterpreter backgroundKeys = new VolumeKeyInterpreter();
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private BackgroundScoreController scoreController;
    private Runnable pendingLongPress;
    private Runnable pendingKeyFallback;
    private long lastShuttleActionAt;
    private long lastPointActionAt;
    private VolumeKeyInterpreter.Action lastPointAction = VolumeKeyInterpreter.Action.NONE;
    private long lastUndoActionAt;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = getServiceInfo();
        if (info == null) return;
        info.flags |= AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS;
        setServiceInfo(info);
        scoreController().warmUp((success, message) -> { });
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        if (event != null && event.getDevice() != null
                && P4GestureInterpreter.isP4Name(event.getDevice().getName())) {
            if (RemoteKeyRelay.dispatch(event)) return true;
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0
                    && P4GestureInterpreter.isOfficialStartKey(event.getDevice().getName(), event.getKeyCode())) {
                sendBackgroundOfficialStart();
            }
            return true;
        }
        if (event == null) return false;
        int keyCode = event.getKeyCode();
        if (!VolumeKeyInterpreter.isSupportedRemoteKey(keyCode)) return false;
        if (RemoteKeyRelay.dispatch(event)) return true;
        if (!RemoteSessionStore.isRecordingEnabled(this)) return false;
        if (!PhoneKeySource.isBuiltIn(event.getDevice())) return false;
        return handleBackgroundKeyEvent(event, keyCode);
    }

    private boolean handleBackgroundKeyEvent(KeyEvent event, int keyCode) {
        VolumeKeyInterpreter.Action action = VolumeKeyInterpreter.Action.NONE;
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getRepeatCount() == 0) {
                VolumeKeyInterpreter.Action previousAction = backgroundKeys.onMissingKeyUp(keyCode);
                if (previousAction != VolumeKeyInterpreter.Action.NONE) {
                    handleResolvedBackgroundAction(previousAction, keyCode, event.getEventTime());
                }
            }
            action = backgroundKeys.onKeyDown(keyCode, event.getEventTime(), event.getRepeatCount());
            if (event.getRepeatCount() == 0) {
                vibrate(18L);
                scheduleLongPress(keyCode, event.getEventTime());
                if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                    scheduleMissingKeyUpFallback(keyCode);
                }
            }
            if (action == VolumeKeyInterpreter.Action.UNDO || action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
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
        if (keyCode == KeyEvent.KEYCODE_CAMERA && action == VolumeKeyInterpreter.Action.USE_SHUTTLE) {
            CameraButtonGesture.shared().onShortPress(eventTime, cameraButtonCallbacks);
            return;
        }
        if (keyCode == KeyEvent.KEYCODE_CAMERA && action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
            CameraButtonGesture.shared().onLongPress(eventTime, cameraButtonCallbacks);
            return;
        }
        if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE || action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
            long now = SystemClock.uptimeMillis();
            if (now - lastShuttleActionAt < SHUTTLE_PRESS_COOLDOWN_MS) return;
            lastShuttleActionAt = now;
            if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE) sendBackgroundUseShuttle();
            else sendBackgroundReturnShuttle();
            return;
        }
        sendBackgroundAction(action);
    }

    private final CameraButtonGesture.Callbacks cameraButtonCallbacks = new CameraButtonGesture.Callbacks() {
        @Override public void undo() { sendBackgroundAction(VolumeKeyInterpreter.Action.UNDO); }
        @Override public void useShuttle() { sendBackgroundUseShuttle(); }
        @Override public void returnShuttle() { sendBackgroundReturnShuttle(); }
    };

    private BackgroundScoreController scoreController() {
        if (scoreController == null) scoreController = new BackgroundScoreController(this);
        return scoreController;
    }

    private void sendBackgroundOfficialStart() {
        try {
            scoreController().startOfficialMatch((success, message) -> keyHandler.post(() -> {
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

    private void sendBackgroundReturnShuttle() {
        try {
            scoreController().returnOneShuttle((success,message) -> keyHandler.post(() -> {
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
        } else if (action == VolumeKeyInterpreter.Action.TEAM_A_PLUS || action == VolumeKeyInterpreter.Action.TEAM_B_PLUS) {
            if (action == lastPointAction && now - lastPointActionAt < SAME_POINT_ECHO_MS) return;
            lastPointAction = action;
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
        if (scoreController != null) scoreController.release();
        super.onDestroy();
    }
}
