package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PhoneKeySourceTest {
    @Test
    public void builtInPhoneKeysUseVendorZeroOrGpioKeys() {
        assertTrue(PhoneKeySource.isBuiltInVendor(0));
        assertTrue(PhoneKeySource.isBuiltInVendor(1));
    }

    @Test
    public void bluetoothAndUsbDevicesAreNotPhoneKeys() {
        assertFalse(PhoneKeySource.isBuiltInVendor(0x248a));
        assertFalse(PhoneKeySource.isBuiltInVendor(0x046d));
        assertFalse(PhoneKeySource.isBuiltInVendor(0x05ac));
    }

    @Test
    public void missingDeviceIsNotAPhoneKey() {
        assertFalse(PhoneKeySource.isBuiltIn(null));
    }
}
