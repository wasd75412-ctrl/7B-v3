package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class HomeWifiTest {
    @Test
    public void matchesOnlyTheHomeNetwork() {
        assertTrue(HomeWifi.matches("\"AAA\""));
        assertTrue(HomeWifi.matches("AAA"));
        assertFalse(HomeWifi.matches("\"AAA-5G\""));
        assertFalse(HomeWifi.matches("\"aaa\""));
        assertFalse(HomeWifi.matches("<unknown ssid>"));
        assertFalse(HomeWifi.matches(null));
    }
}
