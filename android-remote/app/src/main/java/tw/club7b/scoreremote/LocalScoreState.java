package tw.club7b.scoreremote;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class LocalScoreState {
    private final Object lock = new Object();
    private int revision;
    private int clients;
    private boolean pendingUpload;
    private boolean active = true;
    private String matchId = "local-" + System.currentTimeMillis();
    private String startedAt = isoNow();
    private final List<String> teamA = new ArrayList<>();
    private final List<String> teamB = new ArrayList<>();
    private final List<Integer> rallies = new ArrayList<>();
    private int scoreA;
    private int scoreB;
    private Integer winner;
    private int target = 11;
    private int cap = 15;
    private boolean deuce = true;

    JSONObject snapshot() {
        synchronized (lock) {
            JSONObject match = new JSONObject();
            try {
                match.put("active", active);
                match.put("teamA", new JSONArray(teamA));
                match.put("teamB", new JSONArray(teamB));
                match.put("scores", new JSONArray().put(scoreA).put(scoreB));
                match.put("rallies", new JSONArray(rallies));
                match.put("winner", winner == null ? JSONObject.NULL : winner);
                match.put("matchId", matchId);
                match.put("startedAt", startedAt);
                match.put("target", target);
                match.put("cap", cap);
                match.put("deuce", deuce);

                JSONObject root = new JSONObject();
                root.put("protocol", "bcm-local-score-v1");
                root.put("revision", revision);
                root.put("clients", clients);
                root.put("pendingUpload", pendingUpload);
                root.put("updatedAt", isoNow());
                root.put("match", match);
                return root;
            } catch (Exception error) {
                throw new IllegalStateException(error);
            }
        }
    }

    void setClients(int count) {
        synchronized (lock) {
            clients = Math.max(0, count);
        }
    }

    void configureRules(int target, int cap, boolean deuce) {
        synchronized (lock) {
            this.target = Math.max(1, target);
            this.cap = Math.max(this.target, cap);
            this.deuce = deuce;
        }
    }

    ApplyResult apply(String action) {
        synchronized (lock) {
            String name = action == null ? "" : action.trim();
            if (!active) return ApplyResult.fail("unavailable");
            if ("reset".equals(name)) {
                rallies.clear();
                scoreA = 0;
                scoreB = 0;
                winner = null;
                matchId = "local-" + System.currentTimeMillis();
                startedAt = isoNow();
                revision += 1;
                pendingUpload = true;
                return ApplyResult.ok();
            }
            if (winner != null && !"undo".equals(name)) return ApplyResult.fail("finished");
            if ("undo".equals(name)) {
                if (rallies.isEmpty()) return ApplyResult.fail("empty");
                int removed = rallies.remove(rallies.size() - 1);
                if (removed == 0) scoreA = Math.max(0, scoreA - 1);
                else scoreB = Math.max(0, scoreB - 1);
                winner = null;
                revision += 1;
                pendingUpload = true;
                return ApplyResult.ok();
            }
            if ("teamAPlus".equals(name) || "teamBPlus".equals(name)) {
                int side = "teamAPlus".equals(name) ? 0 : 1;
                rallies.add(side);
                if (side == 0) scoreA += 1;
                else scoreB += 1;
                winner = decideWinner();
                revision += 1;
                pendingUpload = true;
                return ApplyResult.ok();
            }
            return ApplyResult.fail("unknown");
        }
    }

    void markUploaded() {
        synchronized (lock) {
            pendingUpload = false;
        }
    }

    LiveMatchOverlayController.OverlayState overlayState() {
        synchronized (lock) {
            return new LiveMatchOverlayController.OverlayState(
                    active,
                    new ArrayList<>(teamA),
                    new ArrayList<>(teamB),
                    scoreA,
                    scoreB
            );
        }
    }

    private Integer decideWinner() {
        int lead = Math.abs(scoreA - scoreB);
        int top = Math.max(scoreA, scoreB);
        if (top >= cap) return scoreA == scoreB ? null : (scoreA > scoreB ? 0 : 1);
        if (top < target) return null;
        if (!deuce || lead >= 2) return scoreA > scoreB ? 0 : 1;
        return null;
    }

    private static String isoNow() {
        return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                .format(new java.util.Date());
    }

    static final class ApplyResult {
        final boolean ok;
        final String reason;

        private ApplyResult(boolean ok, String reason) {
            this.ok = ok;
            this.reason = reason;
        }

        static ApplyResult ok() {
            return new ApplyResult(true, "");
        }

        static ApplyResult fail(String reason) {
            return new ApplyResult(false, reason == null ? "" : reason);
        }
    }
}
