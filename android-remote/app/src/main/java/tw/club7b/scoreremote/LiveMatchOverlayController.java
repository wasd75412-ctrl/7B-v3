package tw.club7b.scoreremote;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class LiveMatchOverlayController implements AutoCloseable {
    interface Listener {
        void onChanged(OverlayState state);
    }

    static final class OverlayState {
        final boolean active;
        final List<String> teamA;
        final List<String> teamB;
        final int scoreA;
        final int scoreB;

        OverlayState(boolean active, List<String> teamA, List<String> teamB, int scoreA, int scoreB) {
            this.active = active;
            this.teamA = Collections.unmodifiableList(new ArrayList<>(teamA));
            this.teamB = Collections.unmodifiableList(new ArrayList<>(teamB));
            this.scoreA = Math.max(0, scoreA);
            this.scoreB = Math.max(0, scoreB);
        }

        static OverlayState waiting() {
            return new OverlayState(false, Collections.emptyList(), Collections.emptyList(), 0, 0);
        }
    }

    private final Listener listener;
    private final Map<String, String> playerNames = new HashMap<>();
    private ListenerRegistration roomRegistration;
    private ListenerRegistration scoreRegistration;
    private MatchSnapshot roomMatch = MatchSnapshot.empty();
    private MatchSnapshot liveMatch = MatchSnapshot.empty();

    LiveMatchOverlayController(android.content.Context context, Listener listener) {
        this.listener = listener;
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isAuthorized()) {
            listener.onChanged(OverlayState.waiting());
            return;
        }
        FirebaseFirestore firestore = BackgroundScoreController.firestore(context);
        roomRegistration = firestore.collection("badmintonRooms").document(session.roomId)
                .addSnapshotListener((snapshot, error) -> {
                    if (error != null || snapshot == null || !snapshot.exists()) return;
                    roomMatch = matchSnapshot(snapshot);
                    updateRoster(snapshot);
                });
        scoreRegistration = firestore.collection("badmintonRooms").document(session.roomId)
                .collection("liveScore").document("current")
                .addSnapshotListener((snapshot, error) -> {
                    if (error != null || snapshot == null || !snapshot.exists()) return;
                    liveMatch = matchSnapshot(snapshot);
                    publish();
                });
    }

    private void updateRoster(DocumentSnapshot snapshot) {
        playerNames.clear();
        Object rosterValue = snapshot.get("roster");
        if (rosterValue instanceof List) {
            for (Object item : (List<?>) rosterValue) {
                Map<String, Object> player = mapValue(item);
                String id = text(player.get("id"));
                String name = text(player.get("name"));
                if (!id.isEmpty() && !name.isEmpty()) playerNames.put(id, name);
            }
        }
        publish();
    }

    private void publish() {
        Map<String, Object> latestMatch = newest(roomMatch, liveMatch).match;
        boolean active = Boolean.TRUE.equals(latestMatch.get("active"));
        List<String> teamA = names(latestMatch.get("teamA"));
        List<String> teamB = names(latestMatch.get("teamB"));
        List<Integer> scores = integers(latestMatch.get("scores"));
        listener.onChanged(new OverlayState(
                active && !teamA.isEmpty() && !teamB.isEmpty(),
                teamA,
                teamB,
                scores.size() > 0 ? scores.get(0) : 0,
                scores.size() > 1 ? scores.get(1) : 0
        ));
    }

    private static MatchSnapshot matchSnapshot(DocumentSnapshot snapshot) {
        Map<String, Object> match = mapValue(snapshot.get("match"));
        Timestamp updatedAt = snapshot.getTimestamp("updatedAt");
        return new MatchSnapshot(match, updatedAt == null ? 0L : updatedAt.toDate().getTime());
    }

    private static MatchSnapshot newest(MatchSnapshot first, MatchSnapshot second) {
        long firstEpoch = number(first.match.get("syncEpoch"));
        long secondEpoch = number(second.match.get("syncEpoch"));
        if (firstEpoch != secondEpoch) return firstEpoch > secondEpoch ? first : second;
        return first.updatedAt > second.updatedAt ? first : second;
    }

    private static long number(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    private static final class MatchSnapshot {
        final Map<String, Object> match;
        final long updatedAt;

        MatchSnapshot(Map<String, Object> match, long updatedAt) {
            this.match = match;
            this.updatedAt = updatedAt;
        }

        static MatchSnapshot empty() {
            return new MatchSnapshot(Collections.emptyMap(), 0L);
        }
    }

    private List<String> names(Object value) {
        List<String> result = new ArrayList<>();
        if (!(value instanceof List)) return result;
        for (Object item : (List<?>) value) {
            String id = text(item);
            if (id.isEmpty()) continue;
            result.add(playerNames.getOrDefault(id, "球員"));
        }
        return result;
    }

    private static List<Integer> integers(Object value) {
        List<Integer> result = new ArrayList<>();
        if (!(value instanceof List)) return result;
        for (Object item : (List<?>) value) {
            if (item instanceof Number) result.add(Math.max(0, ((Number) item).intValue()));
        }
        return result;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapValue(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : Collections.emptyMap();
    }

    @Override public void close() {
        if (roomRegistration != null) roomRegistration.remove();
        if (scoreRegistration != null) scoreRegistration.remove();
        roomRegistration = null;
        scoreRegistration = null;
    }
}
