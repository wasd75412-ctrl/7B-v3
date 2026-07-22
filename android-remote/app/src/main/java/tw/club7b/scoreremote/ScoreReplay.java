package tw.club7b.scoreremote;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class ScoreReplay {
    private ScoreReplay() {
    }

    static Result fromRallies(List<Integer> source, int target, int cap, boolean deuce) {
        List<Integer> rallies = new ArrayList<>();
        if (source != null) {
            for (Integer team : source) if (team != null && (team == 0 || team == 1)) rallies.add(team);
        }
        int[] scores = {0, 0};
        int serving = 0;
        int[][] positions = {{0, 1}, {0, 1}};
        Integer winner = null;
        int safeTarget = Math.max(1, target);
        int safeCap = Math.max(safeTarget, cap);
        for (int team : rallies) {
            if (winner != null) break;
            boolean sameServer = serving == team;
            scores[team]++;
            if (sameServer) {
                int player = positions[team][0];
                positions[team][0] = positions[team][1];
                positions[team][1] = player;
            } else {
                serving = team;
            }
            winner = winnerFor(scores, safeTarget, safeCap, deuce);
        }
        return new Result(rallies, scores, serving, positions, winner);
    }

    private static Integer winnerFor(int[] scores, int target, int cap, boolean deuce) {
        for (int team = 0; team < 2; team++) {
            int opponent = 1 - team;
            if (!deuce && scores[team] >= target) return team;
            if (deuce && scores[team] >= target && scores[team] - scores[opponent] >= 2) return team;
            if (deuce && scores[team] >= cap) return team;
        }
        return null;
    }

    static final class Result {
        final List<Integer> rallies;
        final List<Integer> scores;
        final int serving;
        final List<Integer> posA;
        final List<Integer> posB;
        final Integer winner;

        Result(List<Integer> rallies, int[] scores, int serving, int[][] positions, Integer winner) {
            this.rallies = new ArrayList<>(rallies);
            this.scores = Arrays.asList(scores[0], scores[1]);
            this.serving = serving;
            this.posA = Arrays.asList(positions[0][0], positions[0][1]);
            this.posB = Arrays.asList(positions[1][0], positions[1][1]);
            this.winner = winner;
        }
    }
}
