package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import android.view.KeyEvent;

import org.junit.Test;

public final class YuntengGestureInterpreterTest {
    @Test
    public void mapsObservedZoomPositionsToTeams() {
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                YuntengGestureInterpreter.classify("YUNTENG", 350f, 1000f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classify("YUNTENG", 550f, 1000f));
    }

    @Test
    public void ignoresOtherTouchDevices() {
        assertEquals(VolumeKeyInterpreter.Action.NONE,
                YuntengGestureInterpreter.classify("sec_touchscreen", 350f, 1000f));
    }

    @Test
    public void mapsTheSeparatedAxisAfterScreenRotation() {
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 527f, 539f, 923f, 539f,
                        923f, 539f, 1079f, 2637f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 527f, 539f, 944f, 539f,
                        944f, 539f, 1079f, 2637f));
    }

    @Test
    public void remapsYuntengCameraVolumeKeyOnly() {
        assertEquals(KeyEvent.KEYCODE_CAMERA,
                YuntengGestureInterpreter.remapKeyCode("YUNTENG Consumer Control", KeyEvent.KEYCODE_VOLUME_UP));
        assertEquals(KeyEvent.KEYCODE_VOLUME_UP,
                YuntengGestureInterpreter.remapKeyCode("Other Remote", KeyEvent.KEYCODE_VOLUME_UP));
    }

    @Test
    public void usesSeparateShortConfirmationAndTwoSecondLongThresholds() {
        assertEquals(700L, YuntengGestureInterpreter.SHORT_CONFIRM_MS);
        assertEquals(2000L, YuntengGestureInterpreter.LONG_PRESS_MS);
    }
}
