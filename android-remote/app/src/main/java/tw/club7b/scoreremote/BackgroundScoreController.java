package tw.club7b.scoreremote;

import android.content.Context;
import android.os.SystemClock;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.Source;
import com.google.firebase.firestore.SetOptions;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
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

    interface FullscreenCallback {
        void onComplete(boolean success, String message);
    }

    void useOneShuttle(FullscreenCallback callback) {
        sendShuttleCommand(VolumeKeyInterpreter.Action.USE_SHUTTLE, "已使用 1 顆球", callback);
    }

    void returnOneShuttle(FullscreenCallback callback) {
        sendShuttleCommand(VolumeKeyInterpreter.Action.RETURN_SHUTTLE, "已加回 1 顆球", callback);
    }

    private void sendShuttleCommand(VolumeKeyInterpreter.Action action, String successMessage, FullscreenCallback callback) {
        sendAction(new Request(action, (success, message, ignored) -> {
            if (callback != null) callback.onComplete(success, success ? successMessage : message);
        }, System.currentTimeMillis()));
    }

    private final Context context;
    private final FirebaseFirestore firestore;
    private static final long START_ECHO_SUPPRESS_MS = 500L;
    private final OfficialStartGate officialStartGate = new OfficialStartGate();
    private ListenerRegistration matchListener;
    private String listenedRoomId = "";
    private boolean matchKnown;
    private String matchId = "";
    private boolean matchActive;
    private boolean matchFinished;
    private boolean matchStarted;
    private String startedLatchMatchId = "";
    private String startRequestedMatchId = "";
    private long suppressScoreUntil = Long.MIN_VALUE;

    BackgroundScoreController(Context context) {
        this.context = context.getApplicationContext();
        firestore = firestore(this.context);
    }

    static FirebaseFirestore firestore(Context context) {
        FirebaseApp app;
        try {
            app = FirebaseApp.getInstance(FIREBASE_APP_NAME);
        } catch (IllegalStateException missing) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId(FIREBASE_APP_ID)
                    .setApiKey(FIREBASE_API_KEY)
                    .setProjectId(FIREBASE_PROJECT_ID)
                    .build();
            app = FirebaseApp.initializeApp(context.getApplicationContext(), options, FIREBASE_APP_NAME);
            if (app == null) throw new IllegalStateException("無法啟動比分同步");
        }
        return FirebaseFirestore.getInstance(app);
    }

    synchronized void submitDirect(VolumeKeyInterpreter.Action action, Callback callback) {
        if (action != VolumeKeyInterpreter.Action.TEAM_A_PLUS
                && action != VolumeKeyInterpreter.Action.TEAM_B_PLUS
                && action != VolumeKeyInterpreter.Action.UNDO) return;
        if (LocalScoreModeStore.isEnabled(context)) {
            sendAction(new Request(action, callback, System.currentTimeMillis()));
            return;
        }
        ensureMatchListener(RemoteSessionStore.getSession(context));
        sendAction(new Request(action, callback, System.currentTimeMillis()));
    }

    synchronized void submit(VolumeKeyInterpreter.Action action, Callback callback) {
        if (action == null || action == VolumeKeyInterpreter.Action.NONE) return;
        if (LocalScoreModeStore.isEnabled(context)) {
            sendAction(new Request(action, callback, System.currentTimeMillis()));
            return;
        }
        boolean scoreAction = action == VolumeKeyInterpreter.Action.TEAM_A_PLUS
                || action == VolumeKeyInterpreter.Action.TEAM_B_PLUS;
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        ensureMatchListener(session);
        if (scoreAction && session.isAuthorized() && !matchKnown) {
            liveScoreReference(session).get().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) updateMatch(task.getResult());
                submitResolved(action, callback);
            });
            return;
        }
        submitResolved(action, callback);
    }

    private synchronized void submitResolved(VolumeKeyInterpreter.Action action, Callback callback) {
        boolean scoreAction = action == VolumeKeyInterpreter.Action.TEAM_A_PLUS
                || action == VolumeKeyInterpreter.Action.TEAM_B_PLUS;
        long now = SystemClock.uptimeMillis();
        if (scoreAction && now < suppressScoreUntil) {
            if (callback != null) callback.onComplete(true, "比賽正式開始", action);
            return;
        }
        if (scoreAction) {
            OfficialStartGate.Decision decision = officialStartGate.onScorePress(
                    awaitingOfficialStart(), now);
            if (decision == OfficialStartGate.Decision.WAIT_FOR_SECOND_PRESS) {
                if (callback != null) callback.onComplete(true, "再按一下正式開始", action);
                return;
            }
            if (decision == OfficialStartGate.Decision.OFFICIAL_START) {
                suppressScoreUntil = now + START_ECHO_SUPPRESS_MS;
                String requestedMatchId = matchId;
                startRequestedMatchId = requestedMatchId;
                startOfficialMatch((success, message) -> {
                    if (!success) clearStartRequest(requestedMatchId);
                    if (callback != null) callback.onComplete(success, success ? "比賽正式開始" : message, action);
                });
                return;
            }
        }
        sendAction(new Request(action, callback, System.currentTimeMillis()));
    }

    synchronized boolean allowsFastOfficialStartPress() {
        return !matchKnown || awaitingOfficialStart();
    }

    private synchronized boolean awaitingOfficialStart() {
        return matchKnown && matchActive && !matchFinished && !matchStarted
                && !matchId.isEmpty() && !matchId.equals(startRequestedMatchId);
    }

    private synchronized void clearStartRequest(String requestedMatchId) {
        if (requestedMatchId.equals(startRequestedMatchId)) startRequestedMatchId = "";
    }

    private synchronized void ensureMatchListener(RemoteSessionStore.Session session) {
        if (!session.isAuthorized()) return;
        LocalLinkClient.shared(context).ensureStarted(session);
        if (matchListener != null && session.roomId.equals(listenedRoomId)) return;
        if (matchListener != null) matchListener.remove();
        listenedRoomId = session.roomId;
        matchKnown = false;
        matchStarted = false;
        startedLatchMatchId = "";
        suppressScoreUntil = Long.MIN_VALUE;
        officialStartGate.reset();
        matchListener = liveScoreReference(session).addSnapshotListener((snapshot, error) -> {
            if (error == null && snapshot != null) updateMatch(snapshot);
        });
    }

    private synchronized void updateMatch(DocumentSnapshot snapshot) {
        long now = SystemClock.uptimeMillis();
        Map<String, Object> match = snapshot.exists() ? mapValue(snapshot.get("match")) : new HashMap<>();
        Object id = match.get("matchId");
        Object startedAt = match.get("startedAt");
        String nextMatchId = id == null ? "" : String.valueOf(id);
        boolean nextActive = Boolean.TRUE.equals(match.get("active"));
        boolean nextFinished = match.get("winner") != null;
        boolean startedNow = startedAt != null && !String.valueOf(startedAt).isEmpty();
        if (!nextMatchId.equals(startedLatchMatchId)) {
            startedLatchMatchId = nextMatchId;
            suppressScoreUntil = startedNow ? now + START_ECHO_SUPPRESS_MS : Long.MIN_VALUE;
            matchStarted = startedNow;
        } else if (!nextActive || nextFinished) {
            matchStarted = false;
        } else if (startedNow) {
            if (!matchStarted) suppressScoreUntil = Math.max(suppressScoreUntil, now + START_ECHO_SUPPRESS_MS);
            matchStarted = true;
        }
        matchId = nextMatchId;
        matchActive = nextActive;
        matchFinished = nextFinished;
        matchKnown = true;
    }

    synchronized void release() {
        if (matchListener != null) matchListener.remove();
        matchListener = null;
        listenedRoomId = "";
        matchKnown = false;
    }

    void warmUp(WarmUpCallback callback) {
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isAuthorized()) {
            callback.onComplete(false, "請先連接球局並登入管理員");
            return;
        }
        ensureMatchListener(session);
        liveScoreReference(session).get(Source.SERVER)
                .addOnSuccessListener(snapshot -> callback.onComplete(
                        snapshot.exists(),
                        snapshot.exists() ? "即時比分已連線" : "找不到即時比分，請回 App 重新整理"
                ))
                .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
    }

    void startOfficialMatch(FullscreenCallback callback) {
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isAuthorized()) {
            callback.onComplete(false, "請先連接球局並登入管理員");
            return;
        }
        ensureMatchListener(session);
        DocumentReference liveScore = liveScoreReference(session);
        DocumentReference remoteControl = remoteControlReference(session);
        long clientCreatedAt = System.currentTimeMillis();
        String cachedMatchId = cachedPreStartMatchId();
        if (cachedMatchId != null) {
            Map<String, Object> updates = officialStartUpdates(cachedMatchId, clientCreatedAt);
            sendDirect("officialStart", updates.get("officialStartCommand"));
            remoteControl.set(updates, SetOptions.merge())
                    .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
            callback.onComplete(true, "已送出正式開始比賽");
            return;
        }
        // The iPad may already be on the next match before this phone hears about it; it maps
        // a start stamped with the just-finished match onto that next match.
        String finishedMatchId = cachedFinishedMatchId();
        if (finishedMatchId != null) {
            Map<String, Object> updates = officialStartUpdates(finishedMatchId, clientCreatedAt);
            sendDirect("officialStart", updates.get("officialStartCommand"));
            remoteControl.set(updates, SetOptions.merge())
                    .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
            callback.onComplete(true, "已送出正式開始比賽");
            return;
        }
        firestore.runTransaction(transaction -> {
            DocumentSnapshot snapshot = transaction.get(liveScore);
            if (!snapshot.exists()) throw new IllegalStateException("找不到即時比分");
            Map<String, Object> match = mapValue(snapshot.get("match"));
            Object matchId = match.get("matchId");
            if (!Boolean.TRUE.equals(match.get("active")) || matchId == null || String.valueOf(matchId).isEmpty()) {
                throw new IllegalStateException("找不到目前比賽");
            }
            if (match.get("winner") != null) throw new IllegalStateException("本場比賽已結束");
            if (match.get("startedAt") != null && !String.valueOf(match.get("startedAt")).isEmpty()) {
                throw new IllegalStateException("本場比賽已正式開始");
            }
            transaction.set(remoteControl, officialStartUpdates(String.valueOf(matchId), clientCreatedAt), SetOptions.merge());
            return true;
        })
                .addOnSuccessListener(ignored -> callback.onComplete(true, "已送出正式開始比賽"))
                .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
    }

    private void sendDirect(String type, Object command) {
        if (!(command instanceof Map)) return;
        Map<String, Object> message = new HashMap<>();
        for (Map.Entry<?, ?> entry : ((Map<?, ?>) command).entrySet()) {
            if (!"createdAt".equals(entry.getKey())) message.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        message.put("type", type);
        LocalLinkClient.shared(context).send(message);
    }

    private static Map<String, Object> officialStartUpdates(String matchId, long clientCreatedAt) {
        Map<String, Object> command = new HashMap<>();
        command.put("id", java.util.UUID.randomUUID().toString());
        command.put("matchId", matchId);
        command.put("clientCreatedAt", clientCreatedAt);
        command.put("createdAt", FieldValue.serverTimestamp());
        Map<String, Object> updates = new HashMap<>();
        updates.put("officialStartCommand", command);
        updates.put("updatedAt", FieldValue.serverTimestamp());
        return updates;
    }

    private synchronized String knownMatchId() {
        return matchKnown ? matchId : null;
    }

    private synchronized String cachedPreStartMatchId() {
        return matchKnown && matchActive && !matchFinished && !matchStarted && !matchId.isEmpty() ? matchId : null;
    }

    private synchronized String cachedFinishedMatchId() {
        return matchKnown && matchActive && matchFinished && !matchId.isEmpty() ? matchId : null;
    }

    void markBroadcastRecordingStarted(long clientStartedAt, FullscreenCallback callback) {
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isAuthorized()) {
            callback.onComplete(false, "請先連接球局並登入管理員");
            return;
        }
        Map<String, Object> command = new HashMap<>();
        command.put("id", java.util.UUID.randomUUID().toString());
        command.put("clientCreatedAt", clientStartedAt);
        command.put("createdAt", FieldValue.serverTimestamp());
        Map<String, Object> updates = new HashMap<>();
        updates.put("recordingStartCommand", command);
        updates.put("updatedAt", FieldValue.serverTimestamp());
        remoteControlReference(session).set(updates, SetOptions.merge())
                .addOnSuccessListener(ignored -> callback.onComplete(true, "已記錄錄影開始時間"))
                .addOnFailureListener(error -> callback.onComplete(false, errorMessage(error)));
    }

    private void sendAction(Request request) {
        if (LocalScoreModeStore.isEnabled(context)) {
            deliverLocalAction(request);
            return;
        }
        RemoteSessionStore.Session session = RemoteSessionStore.getSession(context);
        if (!session.isAuthorized()) {
            if (request.callback != null) request.callback.onComplete(false, "請先連接球局並登入管理員", request.action);
            return;
        }
        DocumentReference liveScore = liveScoreReference(session);
        DocumentReference remoteControl = remoteControlReference(session);
        String cachedMatchId = knownMatchId();
        if (cachedMatchId != null) {
            deliverAction(remoteControl, request, cachedMatchId);
            return;
        }
        liveScore.get().addOnCompleteListener(task -> {
            String matchId = "";
            if (task.isSuccessful() && task.getResult() != null && task.getResult().exists()) {
                updateMatch(task.getResult());
                String known = knownMatchId();
                matchId = known == null ? "" : known;
            }
            deliverAction(remoteControl, request, matchId);
        });
    }

    private void deliverLocalAction(Request request) {
        String action = actionName(request.action);
        if (action.isEmpty() || "useShuttle".equals(action) || "returnShuttle".equals(action)) {
            if (request.callback != null) request.callback.onComplete(false, "本機測試版僅支援加分與撤銷", request.action);
            return;
        }
        try {
            org.json.JSONObject result = LocalScoreModeStore.postAction(context, action);
            boolean ok = result.optBoolean("ok", true);
            if (request.callback != null) {
                request.callback.onComplete(ok, ok ? "本機已送出" : "本機計分失敗", request.action);
            }
        } catch (Exception error) {
            if (request.callback != null) {
                request.callback.onComplete(false, error.getMessage() == null ? "本機連線失敗" : error.getMessage(), request.action);
            }
        }
    }

    private void deliverAction(DocumentReference remoteControl, Request request, String matchId) {
        AtomicBoolean reported = new AtomicBoolean(false);
        String id = java.util.UUID.randomUUID().toString();
        Map<String, Object> command = actionCommand(request, matchId, id);
        if ("".equals(command.get("action"))) {
            if (request.callback != null) request.callback.onComplete(false, "無法辨識的計分鍵", request.action);
            return;
        }
        sendDirect("action", command);
        remoteControl.getParent().document("score-" + id).set(command)
                .addOnFailureListener(error -> {
                    if (reported.compareAndSet(false, true) && request.callback != null) {
                        request.callback.onComplete(false, errorMessage(error), request.action);
                    }
                });
        if (reported.compareAndSet(false, true) && request.callback != null) {
            request.callback.onComplete(true, "已送出遙控器指令", request.action);
        }
    }

    private static Map<String, Object> actionCommand(Request request, String matchId, String id) {
        Map<String, Object> command = new HashMap<>();
        command.put("id", id);
        command.put("action", actionName(request.action));
        command.put("matchId", matchId);
        command.put("clientCreatedAt", request.clientCreatedAt);
        return command;
    }

    private static String actionName(VolumeKeyInterpreter.Action action) {
        switch (action) {
            case UNDO:
                return "undo";
            case TEAM_A_PLUS:
                return "teamAPlus";
            case TEAM_B_PLUS:
                return "teamBPlus";
            case USE_SHUTTLE:
                return "useShuttle";
            case RETURN_SHUTTLE:
                return "returnShuttle";
            default:
                return "";
        }
    }

    private DocumentReference liveScoreReference(RemoteSessionStore.Session session) {
        return firestore.collection("badmintonRooms")
                .document(session.roomId)
                .collection("liveScore")
                .document("current");
    }

    private DocumentReference remoteControlReference(RemoteSessionStore.Session session) {
        return firestore.collection("badmintonRooms")
                .document(session.roomId)
                .collection("remoteControl")
                .document("current");
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
        final long clientCreatedAt;

        Request(VolumeKeyInterpreter.Action action, Callback callback, long clientCreatedAt) {
            this.action = action;
            this.callback = callback;
            this.clientCreatedAt = clientCreatedAt;
        }
    }
}
