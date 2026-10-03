package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.KeyEvent;

import org.junit.Test;

public final class P4GestureInterpreterTest {
    @Test
    public void mapsEachButtonToOneAction() {
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                P4GestureInterpreter.classify(4f, 900f, true));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                P4GestureInterpreter.classify(-8f, -900f, true));
        assertEquals(VolumeKeyInterpreter.Action.USE_SHUTTLE,
                P4GestureInterpreter.classify(800f, 12f, true));
        assertEquals(VolumeKeyInterpreter.Action.RETURN_SHUTTLE,
                P4GestureInterpreter.classify(-800f, -20f, true));
        assertEquals(VolumeKeyInterpreter.Action.UNDO,
                P4GestureInterpreter.classify(0f, 0f, false));
    }

    @Test
    public void scoresAsSoonAsTheSwipePassesTheSlopAndOnlyOnce() {
        P4GestureInterpreter gestures = new P4GestureInterpreter();
        float slop = 84f;
        gestures.begin(530f, 515f, true);
        gestures.notePoint(530f, 559f, slop);
        assertEquals(VolumeKeyInterpreter.Action.NONE, gestures.emitOnceMoved(1022L));
        gestures.notePoint(530f, 739f, slop);
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS, gestures.emitOnceMoved(1044L));
        gestures.notePoint(530f, 919f, slop);
        assertEquals(VolumeKeyInterpreter.Action.NONE, gestures.emitOnceMoved(1067L));
        assertEquals(VolumeKeyInterpreter.Action.NONE, gestures.finishTracking(1157L));
    }

    @Test
    public void aTapStillUndoesOnRelease() {
        P4GestureInterpreter gestures = new P4GestureInterpreter();
        gestures.begin(530f, 515f, true);
        assertEquals(VolumeKeyInterpreter.Action.NONE, gestures.emitOnceMoved(1020L));
        assertEquals(VolumeKeyInterpreter.Action.UNDO, gestures.finishTracking(1100L));
    }

    @Test
    public void ignoresTheReleaseJumpBackToTheOrigin() {
        assertTrue(P4GestureInterpreter.isReleaseReset(0f, 0f, 1007f, 1696f));
        assertFalse(P4GestureInterpreter.isReleaseReset(82f, 976f, 1007f, 1696f));
    }

    @Test
    public void officialStartIsEitherAlternatingP4VolumeKey() {
        assertTrue(P4GestureInterpreter.isP4Name("P4"));
        assertTrue(P4GestureInterpreter.isP4Name("P4 Consumer Control"));
        assertFalse(P4GestureInterpreter.isP4Name("YUNTENG"));
        assertTrue(P4GestureInterpreter.isOfficialStartKey("P4 Consumer Control", KeyEvent.KEYCODE_VOLUME_DOWN));
        assertTrue(P4GestureInterpreter.isOfficialStartKey("P4 Consumer Control", KeyEvent.KEYCODE_VOLUME_UP));
        assertFalse(P4GestureInterpreter.isOfficialStartKey("P4 Consumer Control", KeyEvent.KEYCODE_POWER));
        assertFalse(P4GestureInterpreter.isOfficialStartKey("YUNTENG Consumer Control", KeyEvent.KEYCODE_VOLUME_DOWN));
        assertFalse(P4GestureInterpreter.isOfficialStartKey("YUNTENG Consumer Control", KeyEvent.KEYCODE_VOLUME_UP));
    }
}
