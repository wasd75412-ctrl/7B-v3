package tw.club7b.scoreremote;

import android.view.KeyEvent;

final class RemoteKeyRelay {
    interface Listener {
        boolean onRemoteKey(KeyEvent event);
    }

    private static volatile Listener listener;

    private RemoteKeyRelay() {
    }

    static void setListener(Listener next) {
        listener = next;
    }

    static void clearListener(Listener current) {
        if (listener == current) listener = null;
    }

    static boolean dispatch(KeyEvent event) {
        Listener current = listener;
        return current != null && current.onRemoteKey(event);
    }
}
