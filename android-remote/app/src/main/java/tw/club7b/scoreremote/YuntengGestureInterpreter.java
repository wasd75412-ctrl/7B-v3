package tw.club7b.scoreremote;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Locale;

final class YuntengGestureInterpreter {
    private static final float TEAM_SPLIT = 0.45f;
    static final long SHORT_CONFIRM_MS = 700L;
    static final long LONG_PRESS_MS = 2000L;
    private static final long POST_LONG_PRESS_IGNORE_MS = 500L;
    private VolumeKeyInterpreter.Action pendingAction = VolumeKeyInterpreter.Action.NONE;
    private long pressedAt;
    private float initialY;
    private boolean longGesture;
    private long ignoreEventsUntil;

    boolean isYuntengEvent(MotionEvent event) {
        InputDevice device = event == null ? null : event.getDevice();
        return device != null && device.getName() != null
                && device.getName().toUpperCase(java.util.Locale.ROOT).contains("YUNTENG");
    }

    static int remapKeyCode(KeyEvent event) {
        if (event == null) return KeyEvent.KEYCODE_UNKNOWN;
        InputDevice device = event.getDevice();
        return remapKeyCode(device == null ? null : device.getName(), event.getKeyCode());
    }

    static int remapKeyCode(String deviceName, int keyCode) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP && deviceName != null
                && deviceName.toUpperCase(Locale.ROOT).contains("YUNTENG")) {
            return KeyEvent.KEYCODE_CAMERA;
        }
        return keyCode;
    }

    VolumeKeyInterpreter.Action onTouchEvent(MotionEvent event) {
        if (!isYuntengEvent(event)) return VolumeKeyInterpreter.Action.NONE;
        int action = event.getActionMasked();
        if (event.getEventTime() < ignoreEventsUntil) {
            return VolumeKeyInterpreter.Action.NONE;
        }
        if (action == MotionEvent.ACTION_DOWN) {
            pendingAction = VolumeKeyInterpreter.Action.NONE;
            pressedAt = event.getEventTime();
            initialY = -1f;
            longGesture = false;
        }
        if (event.getPointerCount() >= 2) {
            float maxY = Math.max(event.getY(0), event.getY(1));
            if (pendingAction == VolumeKeyInterpreter.Action.NONE) {
                InputDevice.MotionRange range = event.getDevice().getMotionRange(MotionEvent.AXIS_Y, event.getSource());
                float rangeMax = range == null ? 0f : range.getMax();
                pendingAction = classify(event.getDevice().getName(), maxY, rangeMax);
                initialY = maxY;
                if (pressedAt <= 0L) pressedAt = event.getEventTime();
            }
        }
        if (action == MotionEvent.ACTION_CANCEL) {
            reset();
            return VolumeKeyInterpreter.Action.NONE;
        }
        if (action == MotionEvent.ACTION_UP) {
            VolumeKeyInterpreter.Action resolved = longGesture
                    ? resolveLongPress(Math.max(0L, event.getEventTime() - pressedAt))
                    : pendingAction;
            reset();
            return resolved;
        }
        return VolumeKeyInterpreter.Action.NONE;
    }

    private void reset() {
        pendingAction = VolumeKeyInterpreter.Action.NONE;
        pressedAt = 0L;
        initialY = -1f;
        longGesture = false;
    }

    boolean hasPendingPress() {
        return pendingAction != VolumeKeyInterpreter.Action.NONE;
    }

    VolumeKeyInterpreter.Action onLongPressTimeout() {
        if (!hasPendingPress() || !longGesture) return VolumeKeyInterpreter.Action.NONE;
        long now = android.os.SystemClock.uptimeMillis();
        reset();
        ignoreEventsUntil = now + POST_LONG_PRESS_IGNORE_MS;
        return VolumeKeyInterpreter.Action.UNDO;
    }

    VolumeKeyInterpreter.Action onShortPressTimeout() {
        if (!hasPendingPress() || longGesture) return VolumeKeyInterpreter.Action.NONE;
        VolumeKeyInterpreter.Action action = pendingAction;
        reset();
        return action;
    }

    private static VolumeKeyInterpreter.Action resolveLongPress(long durationMs) {
        return durationMs >= LONG_PRESS_MS ? VolumeKeyInterpreter.Action.UNDO : VolumeKeyInterpreter.Action.NONE;
    }

    static VolumeKeyInterpreter.Action classify(String deviceName, float maxY, float rangeMax) {
        if (deviceName == null || !deviceName.toUpperCase(java.util.Locale.ROOT).contains("YUNTENG")
                || rangeMax <= 0f || maxY < 0f) return VolumeKeyInterpreter.Action.NONE;
        return maxY / rangeMax < TEAM_SPLIT
                ? VolumeKeyInterpreter.Action.TEAM_A_PLUS
                : VolumeKeyInterpreter.Action.TEAM_B_PLUS;
    }
}
