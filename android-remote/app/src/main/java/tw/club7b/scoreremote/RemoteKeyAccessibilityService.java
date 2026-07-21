package tw.club7b.scoreremote;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

public final class RemoteKeyAccessibilityService extends AccessibilityService {
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
        return RemoteKeyRelay.dispatch(event);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // This service only filters remote-control keys and never reads screen content.
    }

    @Override
    public void onInterrupt() {
        // No accessibility feedback is produced.
    }
}
