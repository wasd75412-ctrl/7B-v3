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
                        1079f, 2637f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 527f, 539f, 944f, 539f,
                        1079f, 2637f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 539f, 527f, 539f, 923f,
                        2637f, 1079f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 539f, 527f, 539f, 944f,
                        2637f, 1079f));
    }

    @Test
    public void keepsObservedButtonIdentityAtInitialPointerDown() {
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 527f, 539f, 1450f, 539f,
                        1079f, 2637f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                YuntengGestureInterpreter.classifyAxes("YUNTENG", 527f, 539f, 923f, 539f,
                        1079f, 2637f));
    }

    @Test
    public void mapsObservedZoomDirectionWithoutDependingOnScreenCoordinates() {
        assertEquals(VolumeKeyInterpreter.Action.TEAM_A_PLUS,
                YuntengGestureInterpreter.classifyDirection("YUNTENG", 21.1f));
        assertEquals(VolumeKeyInterpreter.Action.TEAM_B_PLUS,
                YuntengGestureInterpreter.classifyDirection("YUNTENG", -21.1f));
        assertEquals(VolumeKeyInterpreter.Action.NONE,
                YuntengGestureInterpreter.classifyDirection("YUNTENG", 2f));
    }

    @Test
    public void remapsYuntengCameraVolumeKeyOnly() {
        assertEquals(KeyEvent.KEYCODE_CAMERA,
                YuntengGestureInterpreter.remapKeyCode("YUNTENG Consumer Control", KeyEvent.KEYCODE_VOLUME_UP));
        assertEquals(KeyEvent.KEYCODE_VOLUME_UP,
                YuntengGestureInterpreter.remapKeyCode("Other Remote", KeyEvent.KEYCODE_VOLUME_UP));
    }

    @Test
    public void waitsOnlyForTheSyntheticCoordinatesToSettle() {
        assertEquals(40L, YuntengGestureInterpreter.GESTURE_SETTLE_MS);
    }

    @Test
    public void officialStartAcceptsASecondPressImmediatelyAfterTheGestureEnds() {
        assertEquals(true, YuntengGestureInterpreter.isNewOfficialStartPress(false, 1000L, 1040L));
        assertEquals(false, YuntengGestureInterpreter.isNewOfficialStartPress(true, 1000L, 1060L));
    }

    @Test
    public void emitsOnlyOnceForAClusterOfSyntheticPointerEvents() {
        assertEquals(true, YuntengGestureInterpreter.isNewPress(Long.MIN_VALUE, 1000L));
        assertEquals(false, YuntengGestureInterpreter.isNewPress(1000L, 1060L));
        assertEquals(false, YuntengGestureInterpreter.isNewPress(1060L, 1130L));
        assertEquals(true, YuntengGestureInterpreter.isNewPress(1130L, 1240L));
        assertEquals(true, YuntengGestureInterpreter.isNewPress(1130L, 1320L));
    }
}
