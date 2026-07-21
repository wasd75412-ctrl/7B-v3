package tw.club7b.scoreremote;

final class VolumeKeyInterpreter {
    static final long LONG_PRESS_MS = 650L;

    enum Action {
        NONE,
        TEAM_A_PLUS,
        TEAM_B_PLUS,
        UNDO
    }

    private int activeKey = -1;
    private long pressedAt = 0L;
    private boolean undoSent = false;

    Action onKeyDown(int keyCode, long eventTime, int repeatCount) {
        if (!isVolumeKey(keyCode)) return Action.NONE;
        if (repeatCount == 0) {
            activeKey = keyCode;
            pressedAt = eventTime;
            undoSent = false;
            return Action.NONE;
        }
        if (activeKey == keyCode && !undoSent && eventTime - pressedAt >= LONG_PRESS_MS) {
            undoSent = true;
            return Action.UNDO;
        }
        return Action.NONE;
    }

    Action onKeyUp(int keyCode, long eventTime) {
        if (!isVolumeKey(keyCode)) return Action.NONE;
        if (activeKey != keyCode) return shortPressAction(keyCode);
        long duration = Math.max(0L, eventTime - pressedAt);
        boolean alreadyUndone = undoSent;
        activeKey = -1;
        pressedAt = 0L;
        undoSent = false;
        if (alreadyUndone) return Action.NONE;
        if (duration >= LONG_PRESS_MS) return Action.UNDO;
        return shortPressAction(keyCode);
    }

    private static Action shortPressAction(int keyCode) {
        return keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP ? Action.TEAM_A_PLUS : Action.TEAM_B_PLUS;
    }

    static boolean isVolumeKey(int keyCode) {
        return keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP || keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN;
    }
}
