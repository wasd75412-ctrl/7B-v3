package tw.club7b.scoreremote;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.util.Locale;

final class P4GestureInterpreter {
    static final float SWIPE_SLOP_DP = 32f;

    private static final long DUPLICATE_ACTION_MS = 150L;

    private boolean tracking;
    private boolean touched;
    private boolean moved;
    private boolean emitted;
    private float startX;
    private float startY;
    private float lastX;
    private float lastY;
    private long lastActionAt = Long.MIN_VALUE;
    private VolumeKeyInterpreter.Action lastAction = VolumeKeyInterpreter.Action.NONE;

    boolean isP4Event(MotionEvent event) {
        return event != null && isP4Name(deviceName(event));
    }

    static boolean isP4Name(String deviceName) {
        if (deviceName == null) return false;
        String normalized = deviceName.trim().toUpperCase(Locale.ROOT);
        return normalized.equals("P4") || normalized.startsWith("P4 ");
    }

    // P4 key 5 alternates between volume up and volume down on every press.
    static boolean isOfficialStartKey(String deviceName, int keyCode) {
        return isP4Name(deviceName)
                && (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP);
    }

    VolumeKeyInterpreter.Action onTouchEvent(MotionEvent event, float density) {
        if (event == null) return VolumeKeyInterpreter.Action.NONE;
        boolean fromP4 = isP4Name(deviceName(event));
        if (!fromP4 && !tracking) return VolumeKeyInterpreter.Action.NONE;
        float slop = SWIPE_SLOP_DP * Math.max(1f, density);
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN
                || action == MotionEvent.ACTION_HOVER_ENTER) {
            begin(event.getX(), event.getY(), action != MotionEvent.ACTION_HOVER_ENTER);
            return VolumeKeyInterpreter.Action.NONE;
        }
        if (!tracking) return VolumeKeyInterpreter.Action.NONE;
        if (action == MotionEvent.ACTION_MOVE || action == MotionEvent.ACTION_HOVER_MOVE) {
            for (int index = 0; index < event.getHistorySize(); index++) {
                notePoint(event.getHistoricalX(index), event.getHistoricalY(index), slop);
            }
            notePoint(event.getX(), event.getY(), slop);
            return emitOnceMoved(event.getEventTime());
        }
        if (action != MotionEvent.ACTION_UP && action != MotionEvent.ACTION_POINTER_UP
                && action != MotionEvent.ACTION_HOVER_EXIT && action != MotionEvent.ACTION_CANCEL) {
            return VolumeKeyInterpreter.Action.NONE;
        }
        return finish(action == MotionEvent.ACTION_CANCEL, event.getEventTime());
    }

    boolean isTracking() {
        return tracking;
    }

    VolumeKeyInterpreter.Action finishTracking(long eventTime) {
        if (!tracking) return VolumeKeyInterpreter.Action.NONE;
        return finish(false, eventTime);
    }

    void begin(float x, float y, boolean touch) {
        if (!tracking) {
            tracking = true;
            touched = false;
            moved = false;
            emitted = false;
            startX = lastX = x;
            startY = lastY = y;
        }
        if (touch) touched = true;
    }

    // P4 plays each swipe as a fixed ~160 ms animation; its direction is clear long before the
    // release, so the action fires as soon as the swipe passes the slop.
    VolumeKeyInterpreter.Action emitOnceMoved(long eventTime) {
        if (!moved || emitted) return VolumeKeyInterpreter.Action.NONE;
        emitted = true;
        return deliver(classify(lastX - startX, lastY - startY, true), eventTime);
    }

    private VolumeKeyInterpreter.Action finish(boolean canceled, long eventTime) {
        boolean didMove = moved;
        boolean alreadyEmitted = emitted;
        float dx = lastX - startX;
        float dy = lastY - startY;
        boolean pressed = touched;
        tracking = false;
        touched = false;
        moved = false;
        emitted = false;
        if (alreadyEmitted) return VolumeKeyInterpreter.Action.NONE;
        if (!didMove && (!pressed || canceled)) return VolumeKeyInterpreter.Action.NONE;
        return deliver(classify(dx, dy, didMove), eventTime);
    }

    private VolumeKeyInterpreter.Action deliver(VolumeKeyInterpreter.Action resolved, long eventTime) {
        if (resolved == lastAction && eventTime >= lastActionAt && eventTime - lastActionAt < DUPLICATE_ACTION_MS) {
            return VolumeKeyInterpreter.Action.NONE;
        }
        lastAction = resolved;
        lastActionAt = eventTime;
        return resolved;
    }

    void notePoint(float x, float y, float slop) {
        if (isReleaseReset(x, y, startX, startY)) return;
        lastX = x;
        lastY = y;
        if (Math.hypot(x - startX, y - startY) >= slop) moved = true;
    }

    static boolean isReleaseReset(float x, float y, float startX, float startY) {
        return x <= 1f && y <= 1f && (startX > 1f || startY > 1f);
    }

    static VolumeKeyInterpreter.Action classify(float dx, float dy, boolean moved) {
        if (!moved) return VolumeKeyInterpreter.Action.UNDO;
        if (Math.abs(dy) >= Math.abs(dx)) {
            return dy >= 0f
                    ? VolumeKeyInterpreter.Action.TEAM_A_PLUS
                    : VolumeKeyInterpreter.Action.TEAM_B_PLUS;
        }
        return dx >= 0f
                ? VolumeKeyInterpreter.Action.USE_SHUTTLE
                : VolumeKeyInterpreter.Action.RETURN_SHUTTLE;
    }

    private static String deviceName(MotionEvent event) {
        InputDevice device = event.getDevice();
        return device == null ? null : device.getName();
    }
}
