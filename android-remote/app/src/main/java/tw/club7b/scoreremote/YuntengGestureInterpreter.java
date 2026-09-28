package tw.club7b.scoreremote;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Locale;

final class YuntengGestureInterpreter {
    private static final float TEAM_SPLIT = 0.45f;
    private static final float HORIZONTAL_TEAM_SPLIT = 0.865f;
    static final long GESTURE_SETTLE_MS = 40L;
    static final long PRESS_QUIET_GAP_MS = 150L;
    private VolumeKeyInterpreter.Action pendingAction = VolumeKeyInterpreter.Action.NONE;
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
        if (event.getPointerCount() < 2) return VolumeKeyInterpreter.Action.NONE;
        if (action == MotionEvent.ACTION_POINTER_DOWN) {
            long eventTime = event.getEventTime();
            boolean newPress = isNewPress(lastPointerDownAt, eventTime);
            lastPointerDownAt = eventTime;
            if (!newPress) return VolumeKeyInterpreter.Action.NONE;
        } else if (action != MotionEvent.ACTION_MOVE || !hasPendingPress()) {
            return VolumeKeyInterpreter.Action.NONE;
        }
        InputDevice.MotionRange xRange = event.getDevice().getMotionRange(MotionEvent.AXIS_X, event.getSource());
        InputDevice.MotionRange yRange = event.getDevice().getMotionRange(MotionEvent.AXIS_Y, event.getSource());
        pendingAction = classifyAxes(
                event.getDevice().getName(),
                event.getX(0), event.getY(0),
                event.getX(1), event.getY(1),
                xRange == null ? 0f : xRange.getMax(),
                yRange == null ? 0f : yRange.getMax()
        );
        return VolumeKeyInterpreter.Action.NONE;
    }

    static boolean isNewPress(long previousPointerDownAt, long eventTime) {
        return previousPointerDownAt == Long.MIN_VALUE
                || eventTime < previousPointerDownAt
                || eventTime - previousPointerDownAt > PRESS_QUIET_GAP_MS;
    }

    private void reset() {
        pendingAction = VolumeKeyInterpreter.Action.NONE;
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
}
