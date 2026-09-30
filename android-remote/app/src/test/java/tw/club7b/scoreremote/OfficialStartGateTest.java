package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class OfficialStartGateTest {
    @Test
    public void singlePressBeforeOfficialStartNeverScores() {
        OfficialStartGate gate = new OfficialStartGate();
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS, gate.onScorePress(true, 1000L));
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS, gate.onScorePress(true, 3000L));
    }

    @Test
    public void doublePressStartsTheMatchOnce() {
        OfficialStartGate gate = new OfficialStartGate();
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS, gate.onScorePress(true, 1000L));
        assertEquals(OfficialStartGate.Decision.OFFICIAL_START, gate.onScorePress(true, 1350L));
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS, gate.onScorePress(true, 1500L));
    }

    @Test
    public void acceptsTheSecondPressUntilTheWindowEnds() {
        OfficialStartGate gate = new OfficialStartGate();
        gate.onScorePress(true, 1000L);
        assertEquals(OfficialStartGate.Decision.OFFICIAL_START,
                gate.onScorePress(true, 1000L + OfficialStartGate.DOUBLE_PRESS_MS));
        gate.onScorePress(true, 5000L);
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS,
                gate.onScorePress(true, 5001L + OfficialStartGate.DOUBLE_PRESS_MS));
    }

    @Test
    public void scoresImmediatelyAfterTheOfficialStart() {
        OfficialStartGate gate = new OfficialStartGate();
        gate.onScorePress(true, 1000L);
        assertEquals(OfficialStartGate.Decision.SCORE, gate.onScorePress(false, 1200L));
        assertEquals(OfficialStartGate.Decision.SCORE, gate.onScorePress(false, 1250L));
        assertEquals(OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS, gate.onScorePress(true, 1300L));
    }
}
