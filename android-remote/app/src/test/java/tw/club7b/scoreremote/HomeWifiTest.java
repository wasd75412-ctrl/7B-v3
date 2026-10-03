package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.InetAddress;

import org.junit.Test;

public final class HomeWifiTest {
    @Test
    public void recognizesIphoneAndAndroidHotspotAddresses() throws Exception {
        assertTrue(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("172.20.10.3")));
        assertTrue(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("172.20.10.15")));
        assertTrue(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("192.168.43.120")));
    }

    @Test
    public void leavesHomeWifiAddressesForUpload() throws Exception {
        assertFalse(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("172.20.10.16")));
        assertFalse(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("192.168.1.20")));
        assertFalse(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("10.0.0.5")));
        assertFalse(HomeWifi.isPhoneHotspotAddress(InetAddress.getByName("fe80::1")));
    }
}
