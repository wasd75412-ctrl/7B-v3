package tw.club7b.scoreremote;

/** Camera2 contrast curve: the stock video look with deeper blacks and brighter midtones for dim gyms. */
final class RecordingToneCurve {
    static final int POINTS = 64;
    private static final float[][] KNOTS = {
            {0f, 0f}, {0.008f, 0f}, {0.016f, 0.013f}, {0.027f, 0.049f}, {0.038f, 0.101f},
            {0.053f, 0.181f}, {0.071f, 0.253f}, {0.102f, 0.378f}, {0.148f, 0.524f}, {0.211f, 0.644f},
            {0.289f, 0.728f}, {0.398f, 0.805f}, {0.55f, 0.886f}, {0.75f, 0.952f}, {1f, 1f},
    };

    private RecordingToneCurve() { }

    /** Interleaved (linear input, encoded output) pairs; evenly spaced because some HALs ignore the input values. */
    static float[] points() {
        float[] curve = new float[POINTS * 2];
        for (int index = 0; index < POINTS; index++) {
            float input = index / (float) (POINTS - 1);
            curve[index * 2] = input;
            curve[index * 2 + 1] = output(input);
        }
        return curve;
    }

    static float output(float linear) {
        float x = Math.max(0f, Math.min(1f, linear));
        for (int index = 1; index < KNOTS.length; index++) {
            float[] low = KNOTS[index - 1], high = KNOTS[index];
            if (x <= high[0]) return low[1] + (high[1] - low[1]) * (x - low[0]) / (high[0] - low[0]);
        }
        return 1f;
    }
}
