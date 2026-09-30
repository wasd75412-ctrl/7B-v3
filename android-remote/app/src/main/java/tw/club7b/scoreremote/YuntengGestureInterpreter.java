package tw.club7b.scoreremote;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Locale;

final class YuntengGestureInterpreter {
    private static final float TEAM_SPLIT = 0.45f;
    private static final float HORIZONTAL_TEAM_SPLIT = 0.865f;
    static final long GESTURE_SETTLE_MS = 40L;
    static final long PRESS_QUIET_GAP_MS = 80L;
    private VolumeKeyInterpreter.Action pendingAction = VolumeKeyInterpreter.Action.NONE;
    private VolumeKeyInterpreter.Action gestureAction = VolumeKeyInterpreter.Action.NONE;
    private long lastPointerDownAt = Long.MIN_VALUE;
    private boolean pendingHorizontal;
    private float pendingAxisStart = Float.NaN;

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

    boolean onTouchEvent(MotionEvent event) {
        if (!isYuntengEvent(event)) return false;
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_POINTER_DOWN) {
            if (event.getPointerCount() < 2) return false;
            long eventTime = event.getEventTime();
            boolean newPress = isNewPress(lastPointerDownAt, eventTime);
            lastPointerDownAt = eventTime;
            if (!newPress) return false;
            pendingHorizontal = Math.abs(event.getX(1) - event.getX(0))
                    > Math.abs(event.getY(1) - event.getY(0));
            pendingAxisStart = pendingHorizontal ? event.getX(1) : event.getY(1);
            pendingAction = VolumeKeyInterpreter.Action.NONE;
            gestureAction = VolumeKeyInterpreter.Action.NONE;
            return false;
        }
        if (action == MotionEvent.ACTION_MOVE && event.getPointerCount() >= 2
                && !Float.isNaN(pendingAxisStart)) {
            float currentAxis = pendingHorizontal ? event.getX(1) : event.getY(1);
            VolumeKeyInterpreter.Action candidate = classifyDirection(
                    event.getDevice().getName(), currentAxis - pendingAxisStart);
            if (candidate != VolumeKeyInterpreter.Action.NONE) gestureAction = candidate;
            return false;
        }
        if (action != MotionEvent.ACTION_POINTER_UP && action != MotionEvent.ACTION_UP) {
            return false;
        }
        pendingAxisStart = Float.NaN;
        if (gestureAction == VolumeKeyInterpreter.Action.NONE || hasPendingPress()) {
            gestureAction = VolumeKeyInterpreter.Action.NONE;
            return false;
        }
        pendingAction = gestureAction;
        gestureAction = VolumeKeyInterpreter.Action.NONE;
        return true;
    }

    boolean discardUnsentPress(MotionEvent event) {
        if (!hasPendingPress() || !isYuntengEvent(event)
                || event.getActionMasked() != MotionEvent.ACTION_POINTER_DOWN
                || event.getPointerCount() < 2
                || !isNewPress(lastPointerDownAt, event.getEventTime())) return false;
        reset();
        return true;
    }

    static boolean isNewPress(long previousPointerDownAt, long eventTime) {
        return previousPointerDownAt == Long.MIN_VALUE
                || eventTime < previousPointerDownAt
                || eventTime - previousPointerDownAt > PRESS_QUIET_GAP_MS;
    }

    private void reset() {
        pendingAction = VolumeKeyInterpreter.Action.NONE;
        gestureAction = VolumeKeyInterpreter.Action.NONE;
        pendingAxisStart = Float.NaN;
    }

    boolean hasPendingPress() {
        return pendingAction != VolumeKeyInterpreter.Action.NONE;
    }

    VolumeKeyInterpreter.Action onSettledPress() {
        if (!hasPendingPress()) return VolumeKeyInterpreter.Action.NONE;
        VolumeKeyInterpreter.Action action = pendingAction;
        reset();
        return action;
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
            float xRangeMax, float yRangeMax
    ) {
        boolean horizontalGesture = Math.abs(x1 - x0) > Math.abs(y1 - y0);
        float rangeMax = horizontalGesture ? xRangeMax : yRangeMax;
        float value = horizontalGesture ? Math.max(x0, x1) : Math.max(y0, y1);
        float split = rangeMax < 1500f ? HORIZONTAL_TEAM_SPLIT : TEAM_SPLIT;
        return classify(deviceName, value, rangeMax, split);
    }

    static VolumeKeyInterpreter.Action classifyDirection(String deviceName, float delta) {
        if (deviceName == null || !deviceName.toUpperCase(Locale.ROOT).contains("YUNTENG")
                || Math.abs(delta) < 5f) return VolumeKeyInterpreter.Action.NONE;
        return delta > 0f
                ? VolumeKeyInterpreter.Action.TEAM_A_PLUS
                : VolumeKeyInterpreter.Action.TEAM_B_PLUS;
    }
}
