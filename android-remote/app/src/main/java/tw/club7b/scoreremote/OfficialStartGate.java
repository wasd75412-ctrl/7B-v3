package tw.club7b.scoreremote;

final class OfficialStartGate {
    // P4 score presses are swipes (~160 ms each), so the window is wider than a button double-tap.
    static final long DOUBLE_PRESS_MS = 1000L;

    enum Decision {
        SCORE,
        WAIT_FOR_SECOND_PRESS,
        OFFICIAL_START
    }

    private long firstPressAt = Long.MIN_VALUE;

    Decision onScorePress(boolean awaitingOfficialStart, long now) {
        if (!awaitingOfficialStart) {
            reset();
            return Decision.SCORE;
        }
        if (firstPressAt == Long.MIN_VALUE || now < firstPressAt) {
            firstPressAt = now;
            return Decision.WAIT_FOR_SECOND_PRESS;
        }
        long gap = now - firstPressAt;
        if (gap <= DOUBLE_PRESS_MS) {
            reset();
            return Decision.OFFICIAL_START;
        }
        firstPressAt = now;
        return Decision.WAIT_FOR_SECOND_PRESS;
    }

    void reset() {
        firstPressAt = Long.MIN_VALUE;
    }
}
