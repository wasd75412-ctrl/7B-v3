package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class RecordingToneCurveTest {
    @Test
    public void coversTheFullRangeWithIncreasingPoints() {
        float[] curve = RecordingToneCurve.points();
        assertEquals(RecordingToneCurve.POINTS * 2, curve.length);
        assertEquals(0f, curve[0], 0f);
        assertEquals(0f, curve[1], 0f);
        assertEquals(1f, curve[curve.length - 2], 0f);
        assertEquals(1f, curve[curve.length - 1], 1e-6f);
        float step = 1f / (RecordingToneCurve.POINTS - 1);
        for (int index = 2; index < curve.length; index += 2) {
            assertEquals(step, curve[index] - curve[index - 2], 1e-6f);
            assertTrue(curve[index + 1] >= curve[index - 1]);
        }
    }

    @Test
    public void deepensShadowsAndLiftsMidtonesComparedWithSrgb() {
        assertTrue(RecordingToneCurve.output(0.02f) < srgb(0.02f));
        assertTrue(RecordingToneCurve.output(0.25f) > srgb(0.25f));
    }

    private static float srgb(float linear) {
        return (float) (1.055 * Math.pow(linear, 1 / 2.4) - 0.055);
    }
}
