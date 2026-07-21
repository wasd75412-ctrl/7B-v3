package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import android.view.KeyEvent;
import org.junit.Test;

public final class VolumeKeyInterpreterTest {
    @Test
    public void shortVolumeUpAddsTeamA() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        assertEquals(VolumeKeyInterpreter.Action.NONE, interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_UP, 100L, 0));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS, interpreter.onKeyUp(KeyEvent.KEYCODE_VOLUME_UP, 220L));
    }

    @Test
    public void shortVolumeDownAddsTeamB() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_DOWN, 100L, 0);
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS, interpreter.onKeyUp(KeyEvent.KEYCODE_VOLUME_DOWN, 240L));
    }

    @Test
    public void longPressUndoesOnlyOnce() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_UP, 100L, 0);
        assertEquals(VolumeKeyInterpreter.Action.UNDO, interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_UP, 800L, 1));
        assertEquals(VolumeKeyInterpreter.Action.NONE, interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_UP, 900L, 2));
        assertEquals(VolumeKeyInterpreter.Action.NONE, interpreter.onKeyUp(KeyEvent.KEYCODE_VOLUME_UP, 950L));
    }

    @Test
    public void longReleaseWithoutRepeatsStillUndoes() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_DOWN, 100L, 0);
        assertEquals(VolumeKeyInterpreter.Action.UNDO, interpreter.onKeyUp(KeyEvent.KEYCODE_VOLUME_DOWN, 900L));
    }

    @Test
    public void missingKeyUpFallsBackToShortPressOnlyOnce() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        interpreter.onKeyDown(KeyEvent.KEYCODE_VOLUME_UP, 100L, 0);
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS, interpreter.onMissingKeyUp(KeyEvent.KEYCODE_VOLUME_UP));
        assertEquals(VolumeKeyInterpreter.Action.NONE, interpreter.onKeyUp(KeyEvent.KEYCODE_VOLUME_UP, 1200L));
    }

    @Test
    public void commonCameraRemoteKeysAreSupported() {
        VolumeKeyInterpreter interpreter = new VolumeKeyInterpreter();
        interpreter.onKeyDown(KeyEvent.KEYCODE_CAMERA, 100L, 0);
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS, interpreter.onKeyUp(KeyEvent.KEYCODE_CAMERA, 180L));
        interpreter.onKeyDown(KeyEvent.KEYCODE_ENTER, 300L, 0);
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS, interpreter.onKeyUp(KeyEvent.KEYCODE_ENTER, 380L));
    }
}
