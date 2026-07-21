package tw.club7b.scoreremote;

final class VolumeKeyInterpreter {
    static final long LONG_PRESS_MS = 600L;

    enum Action {
        NONE,
        TEAM_A_PLUS,
        TEAM_B_PLUS,
        UNDO
    }

    private int activeKey = -1;
    private long pressedAt = 0L;
    private boolean undoSent = false;
    private int ignoredKeyUp = -1;

    Action onKeyDown(int keyCode, long eventTime, int repeatCount) {
        if (!isSupportedRemoteKey(keyCode)) return Action.NONE;
        if (repeatCount == 0) {
            activeKey = keyCode;
            pressedAt = eventTime;
            undoSent = false;
            ignoredKeyUp = -1;
            return Action.NONE;
        }
        if (activeKey == keyCode && !undoSent && eventTime - pressedAt >= LONG_PRESS_MS) {
            undoSent = true;
            return Action.UNDO;
        }
        return Action.NONE;
    }

    Action onKeyUp(int keyCode, long eventTime) {
        if (!isSupportedRemoteKey(keyCode)) return Action.NONE;
        if (ignoredKeyUp == keyCode) {
            ignoredKeyUp = -1;
            return Action.NONE;
        }
        if (activeKey != keyCode) return shortPressAction(keyCode);
        long duration = Math.max(0L, eventTime - pressedAt);
        boolean alreadyUndone = undoSent;
        resetActiveKey();
        if (alreadyUndone) return Action.NONE;
        if (duration >= LONG_PRESS_MS) return Action.UNDO;
        return shortPressAction(keyCode);
    }

    Action onMissingKeyUp(int keyCode) {
        if (activeKey != keyCode || undoSent) return Action.NONE;
        Action action = shortPressAction(keyCode);
        ignoredKeyUp = keyCode;
        resetActiveKey();
        return action;
    }

    private void resetActiveKey() {
        activeKey = -1;
        pressedAt = 0L;
        undoSent = false;
    }

    private static Action shortPressAction(int keyCode) {
        switch (keyCode) {
            case android.view.KeyEvent.KEYCODE_VOLUME_UP:
            case android.view.KeyEvent.KEYCODE_CAMERA:
            case android.view.KeyEvent.KEYCODE_ZOOM_IN:
            case android.view.KeyEvent.KEYCODE_MEDIA_NEXT:
                return Action.TEAM_A_PLUS;
            case android.view.KeyEvent.KEYCODE_VOLUME_DOWN:
            case android.view.KeyEvent.KEYCODE_FOCUS:
            case android.view.KeyEvent.KEYCODE_ENTER:
            case android.view.KeyEvent.KEYCODE_DPAD_CENTER:
            case android.view.KeyEvent.KEYCODE_SPACE:
            case android.view.KeyEvent.KEYCODE_ZOOM_OUT:
            case android.view.KeyEvent.KEYCODE_HEADSETHOOK:
            case android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return Action.TEAM_B_PLUS;
            default:
                return Action.NONE;
        }
    }

    static boolean isSupportedRemoteKey(int keyCode) {
        return shortPressAction(keyCode) != Action.NONE;
    }

    static String keyLabel(int keyCode) {
        switch (keyCode) {
            case android.view.KeyEvent.KEYCODE_VOLUME_UP:
                return "音量＋";
            case android.view.KeyEvent.KEYCODE_VOLUME_DOWN:
                return "音量－";
            case android.view.KeyEvent.KEYCODE_CAMERA:
                return "相機鍵";
            case android.view.KeyEvent.KEYCODE_FOCUS:
                return "對焦鍵";
            case android.view.KeyEvent.KEYCODE_ENTER:
            case android.view.KeyEvent.KEYCODE_DPAD_CENTER:
                return "確認鍵";
            case android.view.KeyEvent.KEYCODE_SPACE:
                return "空白鍵";
            case android.view.KeyEvent.KEYCODE_ZOOM_IN:
                return "放大鍵";
            case android.view.KeyEvent.KEYCODE_ZOOM_OUT:
                return "縮小鍵";
            case android.view.KeyEvent.KEYCODE_MEDIA_NEXT:
                return "下一首鍵";
            case android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return "上一首鍵";
            default:
                return "播放鍵";
        }
    }
}
