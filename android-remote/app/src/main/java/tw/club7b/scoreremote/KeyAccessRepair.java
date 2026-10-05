package tw.club7b.scoreremote;

import android.Manifest;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.util.Log;

/**
 * Android 9 switches accessibility off when the app is updated or force-stopped while the
 * settings toggle still looks on. With WRITE_SECURE_SETTINGS granted once over adb, the app
 * re-enables its own key service instead of sending the user to settings.
 */
final class KeyAccessRepair {
    private KeyAccessRepair() { }

    static boolean restore(Context context) {
        if (context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        try {
            String service = new ComponentName(context, RemoteKeyAccessibilityService.class).flattenToString();
            ContentResolver resolver = context.getContentResolver();
            String current = Settings.Secure.getString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            Settings.Secure.putString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, withService(current, service));
            Settings.Secure.putInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 1);
            return true;
        } catch (RuntimeException error) {
            Log.w("7BKeyAccess", "Unable to re-enable key access", error);
            return false;
        }
    }

    static String withService(String current, String service) {
        if (current == null || current.trim().isEmpty()) return service;
        for (String entry : current.split(":")) {
            if (entry.equalsIgnoreCase(service)) return current;
        }
        return current + ":" + service;
    }
}
