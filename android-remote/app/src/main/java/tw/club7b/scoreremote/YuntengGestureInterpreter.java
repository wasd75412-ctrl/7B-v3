package tw.club7b.scoreremote;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Locale;

final class YuntengGestureInterpreter {
    private static final float TEAM_SPLIT = 0.45f;
    private static final float HORIZONTAL_TEAM_SPLIT = 0.865f;
    static final long SHORT_CONFIRM_MS = 700L;
    static final long LONG_PRESS_MS = 2000L;
    static final long PRESS_QUIET_GAP_MS = 150L;
    private static final long POST_LONG_PRESS_IGNORE_MS = 500L;
    private VolumeKeyInterpreter.Action pendingAction = VolumeKeyInterpreter.Action.NONE;
    private long pressedAt;
    private float initialY;
    private boolean longGesture;
    private long ignoreEventsUntil;
    private long lastPointerDownAt = Long.MIN_VALUE;

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
        if (action != MotionEvent.ACTION_POINTER_DOWN || event.getPointerCount() < 2) {
            return VolumeKeyInterpreter.Action.NONE;
        }
        long eventTime = event.getEventTime();
        boolean newPress = isNewPress(lastPointerDownAt, eventTime);
        lastPointerDownAt = eventTime;
        if (!newPress) return VolumeKeyInterpreter.Action.NONE;
        int pointerIndex = event.getActionIndex();
        InputDevice.MotionRange xRange = event.getDevice().getMotionRange(MotionEvent.AXIS_X, event.getSource());
        InputDevice.MotionRange yRange = event.getDevice().getMotionRange(MotionEvent.AXIS_Y, event.getSource());
        return classifyAxes(
                event.getDevice().getName(),
                event.getX(0), event.getY(0),
                event.getX(1), event.getY(1),
                event.getX(pointerIndex), event.getY(pointerIndex),
                xRange == null ? 0f : xRange.getMax(),
                yRange == null ? 0f : yRange.getMax()
        );
    }

    static boolean isNewPress(long previousPointerDownAt, long eventTime) {
        return previousPointerDownAt == Long.MIN_VALUE
                || eventTime < previousPointerDownAt
                || eventTime - previousPointerDownAt > PRESS_QUIET_GAP_MS;
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
        return classify(deviceName, maxY, rangeMax, TEAM_SPLIT);
    }

    private static VolumeKeyInterpreter.Action classify(String deviceName, float value, float rangeMax, float split) {
        if (deviceName == null || !deviceName.toUpperCase(java.util.Locale.ROOT).contains("YUNTENG")
                || rangeMax <= 0f || value < 0f) return VolumeKeyInterpreter.Action.NONE;
        return value / rangeMax < split
                ? VolumeKeyInterpreter.Action.TEAM_A_PLUS
                : VolumeKeyInterpreter.Action.TEAM_B_PLUS;
    }

    static VolumeKeyInterpreter.Action classifyAxes(
            String deviceName,
            float x0, float y0,
            float x1, float y1,
            float newX, float newY,
            float xRangeMax, float yRangeMax
    ) {
        boolean horizontalGesture = Math.abs(x1 - x0) > Math.abs(y1 - y0);
        float rangeMax = horizontalGesture ? xRangeMax : yRangeMax;
        float value = horizontalGesture ? newX : newY;
        float split = rangeMax < 1500f ? HORIZONTAL_TEAM_SPLIT : TEAM_SPLIT;
        return classify(deviceName, value, rangeMax, split);
    }
}
