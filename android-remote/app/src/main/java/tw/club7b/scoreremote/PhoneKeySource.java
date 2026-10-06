package tw.club7b.scoreremote;

import android.os.Build;
import android.view.InputDevice;

final class PhoneKeySource {
    private PhoneKeySource() { }

    static boolean isBuiltIn(InputDevice device) {
        if (device == null || device.isVirtual()) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return !device.isExternal();
        return isBuiltInVendor(device.getVendorId());
    }

    // Android 9 hides isExternal(); its built-in keys report vendor 0, or 0x0001 from gpio-keys,
    // while Bluetooth and USB keyboards and headsets carry a real vendor id.
    static boolean isBuiltInVendor(int vendorId) {
        return vendorId == 0 || vendorId == 1;
    }
}
