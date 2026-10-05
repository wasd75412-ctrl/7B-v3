package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class KeyAccessRepairTest {
    private static final String SERVICE = "tw.club7b.scoreremote/tw.club7b.scoreremote.RemoteKeyAccessibilityService";

    @Test
    public void addsTheServiceWhenNothingIsEnabled() {
        assertEquals(SERVICE, KeyAccessRepair.withService(null, SERVICE));
        assertEquals(SERVICE, KeyAccessRepair.withService("", SERVICE));
    }

    @Test
    public void keepsOtherServicesAndAvoidsDuplicates() {
        String other = "com.example/.Reader";
        assertEquals(other + ":" + SERVICE, KeyAccessRepair.withService(other, SERVICE));
        assertEquals(other + ":" + SERVICE, KeyAccessRepair.withService(other + ":" + SERVICE, SERVICE));
    }
}
