package tw.club7b.scoreremote;

import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Source;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class BackgroundScoreController {
    private static final String FIREBASE_APP_NAME = "7b-recording-score";
    private static final String FIREBASE_PROJECT_ID = "badminton-7a1c3";
    private static final String FIREBASE_API_KEY = "AIzaSyBrakbTPK7UqEChPBI6pM8-i03IcLq0IvM";
    private static final String FIREBASE_APP_ID = "1:883534015507:web:a7f6fb318151b6d07563e6";

    interface Callback {
        void onComplete(boolean success, String message, VolumeKeyInterpreter.Action action);
    }

    interface WarmUpCallback {
        void onComplete(boolean success, String message);
    }

    private final Context context;
    private final FirebaseFirestore firestore;
    private final ArrayDeque<Request> pending = new ArrayDeque<>();
    private boolean processing;

    BackgroundScoreController(Context context) {
        this.context = context.getApplicationContext();
        FirebaseApp app;
        try {
            app = FirebaseApp.getInstance(FIREBASE_APP_NAME);
        } catch (IllegalStateException missing) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId(FIREBASE_APP_ID)
                    .setApiKey(FIREBASE_API_KEY)
                    .setProjectId(FIREBASE_PROJECT_ID)
                    .build();
            app = FirebaseApp.initializeApp(this.context, options, FIREBASE_APP_NAME);
            if (app == null) throw new IllegalStateException("無法啟動比分同步");
        }
        firestore = FirebaseFirestore.getInstance(app);
    }

    synchronized void submit(VolumeKeyInterpreter.Action action, Callback callback) {
        if (action == null || action == VolumeKeyInterpreter.Action.NONE) return;
        pending.addLast(new Request(action, callback));
        if (!processing) processNext();
    }

    void warmUp(WarmUpCallback callback) {
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isReady()) {
            callback.onComplete(false, "請先連接球局、登入管理員並開始比賽");
            return;
        }
        liveScoreReference(session).get(Source.SERVER)
                .addOnSuccessListener(snapshot -> callback.onComplete(
                        snapshot.exists(),
                        snapshot.exists() ? "即時比分已連線" : "找不到即時比分，請回 App 重新整理"
                ))
                .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
    }

    private synchronized void processNext() {
        Request request = pending.pollFirst();
        if (request == null) {
            processing = false;
            return;
        }
        processing = true;
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isReady()) {
            complete(request, false, "請先連接球局、登入管理員並開始比賽");
            return;
        }

        DocumentReference liveScore = liveScoreReference(session);
        firestore.runTransaction(transaction -> {
            DocumentSnapshot snapshot = transaction.get(liveScore);
            if (!snapshot.exists()) throw new IllegalStateException("找不到即時比分，請回 App 重新整理");
            Map<String, Object> match = mapValue(snapshot.get("match"));
            if (!Boolean.TRUE.equals(match.get("active"))) throw new IllegalStateException("目前沒有進行中的比賽");
            if (match.get("winner") != null) throw new IllegalStateException("本場比賽已結束");

            List<Integer> rallies = integerList(match.get("rallies"));
            if (request.action == VolumeKeyInterpreter.Action.UNDO) {
                if (rallies.isEmpty()) throw new IllegalStateException("目前沒有可撤銷的分數");
                rallies.remove(rallies.size() - 1);
            } else {
                rallies.add(request.action == VolumeKeyInterpreter.Action.TEAM_A_PLUS ? 0 : 1);
            }

            ScoreReplay.Result result = ScoreReplay.fromRallies(
                    rallies,
                    session.target,
                    session.cap,
                    session.deuce
            );
            Map<String, Object> updates = new HashMap<>();
            updates.put("match.rallies", result.rallies);
            updates.put("match.scores", result.scores);
            updates.put("match.serving", result.serving);
            updates.put("match.posA", result.posA);
            updates.put("match.posB", result.posB);
            updates.put("match.winner", result.winner);
            updates.put("updatedAt", FieldValue.serverTimestamp());
            transaction.update(liveScore, updates);
            return result;
        }).addOnSuccessListener(result -> complete(request, true, successMessage(request.action, result)))
                .addOnFailureListener(error -> complete(request, false, errorMessage(error)));
    }

    private DocumentReference liveScoreReference(RemoteSessionStore.Session session) {
        return firestore.collection("badmintonRooms")
                .document(session.roomId)
                .collection("liveScore")
                .document("current");
    }

    private void complete(Request request, boolean success, String message) {
        if (request.callback != null) request.callback.onComplete(success, message, request.action);
        synchronized (this) {
            processing = false;
            processNext();
        }
    }

    private static String successMessage(VolumeKeyInterpreter.Action action, ScoreReplay.Result result) {
        if (action == VolumeKeyInterpreter.Action.UNDO) return "已撤銷上一分 · " + scoreText(result);
        return (action == VolumeKeyInterpreter.Action.TEAM_A_PLUS ? "A隊 ＋1 · " : "B隊 ＋1 · ") + scoreText(result);
    }

    private static String scoreText(ScoreReplay.Result result) {
        return result.scores.get(0) + "：" + result.scores.get(1);
    }

    private static String errorMessage(Exception error) {
        Throwable cause = error;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        String message = cause.getMessage();
        if (message == null || message.trim().isEmpty()) return "比分同步失敗，請確認網路連線";
        if (message.contains("PERMISSION_DENIED")) return "沒有比分同步權限";
        if (message.contains("UNAVAILABLE") || message.contains("network")) return "網路中斷，比分尚未送出";
        return message;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> mapValue(Object value) {
        return value instanceof Map ? (Map<String, Object>) value : new HashMap<>();
    }

    private static List<Integer> integerList(Object value) {
        List<Integer> result = new ArrayList<>();
        if (!(value instanceof List)) return result;
        for (Object item : (List<?>) value) {
            if (!(item instanceof Number)) continue;
            int team = ((Number) item).intValue();
            if (team == 0 || team == 1) result.add(team);
        }
        return result;
    }

    private static final class Request {
        final VolumeKeyInterpreter.Action action;
        final Callback callback;

        Request(VolumeKeyInterpreter.Action action, Callback callback) {
            this.action = action;
            this.callback = callback;
        }
    }
}
