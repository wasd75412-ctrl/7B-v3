package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import org.junit.Test;

public final class ScoreReplayTest {
    @Test
    public void replaysScoresServeAndRotationLikeWebApp() {
        ScoreReplay.Result result = ScoreReplay.fromRallies(Arrays.asList(0, 0, 1, 1), 11, 15, true);
        assertEquals(Arrays.asList(2, 2), result.scores);
        assertEquals(1, result.serving);
        assertEquals(Arrays.asList(0, 1), result.posA);
        assertEquals(Arrays.asList(1, 0), result.posB);
        assertNull(result.winner);
    }

    @Test
    public void normalDeuceRequiresTwoPointLead() {
        ScoreReplay.Result tiedAtTarget = ScoreReplay.fromRallies(
                Arrays.asList(0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1),
                11,
                15,
                true
        );
        assertNull(tiedAtTarget.winner);
        ScoreReplay.Result winner = ScoreReplay.fromRallies(
                Arrays.asList(0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0),
                11,
                15,
                true
        );
        assertEquals(Integer.valueOf(0), winner.winner);
        assertEquals(Arrays.asList(13, 11), winner.scores);
    }

    @Test
    public void capEndsADeuceGame() {
        Integer[] rallies = new Integer[29];
        for (int i = 0; i < 28; i++) rallies[i] = i % 2;
        rallies[28] = 1;
        ScoreReplay.Result result = ScoreReplay.fromRallies(Arrays.asList(rallies), 11, 15, true);
        assertEquals(Arrays.asList(14, 15), result.scores);
        assertEquals(Integer.valueOf(1), result.winner);
    }

    @Test
    public void noDeuceEndsAtTarget() {
        ScoreReplay.Result result = ScoreReplay.fromRallies(Arrays.asList(1, 1, 1), 3, 5, false);
        assertEquals(Integer.valueOf(1), result.winner);
    }
}
