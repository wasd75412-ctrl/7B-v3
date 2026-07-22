package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Locale;

final class RemoteSessionStore {
    private static final String PREFS = "recording_score_session_v1";
    private static final String RECORDING = "recording";
    private static final String RECORDING_UPDATED_AT = "recording_updated_at";
    private static final String ROOM_ID = "room_id";
    private static final String HOST_AUTHORIZED = "host_authorized";
    private static final String MATCH_ACTIVE = "match_active";
    private static final String TARGET = "target";
    private static final String CAP = "cap";
    private static final String DEUCE = "deuce";
    private static final long MAX_RECORDING_AGE_MS = 8L * 60L * 60L * 1000L;

    private RemoteSessionStore() {
    }

    static void setRecordingEnabled(Context context, boolean enabled) {
        prefs(context).edit()
                .putBoolean(RECORDING, enabled)
                .putLong(RECORDING_UPDATED_AT, System.currentTimeMillis())
                .apply();
    }

    static boolean isRecordingEnabled(Context context) {
        SharedPreferences prefs = prefs(context);
        if (!prefs.getBoolean(RECORDING, false)) return false;
        long updatedAt = prefs.getLong(RECORDING_UPDATED_AT, 0L);
        if (updatedAt <= 0L || System.currentTimeMillis() - updatedAt > MAX_RECORDING_AGE_MS) {
            setRecordingEnabled(context, false);
            return false;
        }
        return true;
    }

    static void updateSession(
            Context context,
            String roomId,
            boolean hostAuthorized,
            boolean matchActive,
            int target,
            int cap,
            boolean deuce
    ) {
        prefs(context).edit()
                .putString(ROOM_ID, normalizeRoomId(roomId))
                .putBoolean(HOST_AUTHORIZED, hostAuthorized)
                .putBoolean(MATCH_ACTIVE, matchActive)
                .putInt(TARGET, Math.max(1, target))
                .putInt(CAP, Math.max(Math.max(1, target), cap))
                .putBoolean(DEUCE, deuce)
                .apply();
    }

    static Session getSession(Context context) {
        SharedPreferences prefs = prefs(context);
        int target = Math.max(1, prefs.getInt(TARGET, 11));
        return new Session(
                prefs.getString(ROOM_ID, ""),
                prefs.getBoolean(HOST_AUTHORIZED, false),
                prefs.getBoolean(MATCH_ACTIVE, false),
                target,
                Math.max(target, prefs.getInt(CAP, 15)),
                prefs.getBoolean(DEUCE, true)
        );
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String normalizeRoomId(String roomId) {
        String normalized = roomId == null ? "" : roomId.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return normalized.length() > 6 ? normalized.substring(0, 6) : normalized;
    }

    static final class Session {
        final String roomId;
        final boolean hostAuthorized;
        final boolean matchActive;
        final int target;
        final int cap;
        final boolean deuce;

        Session(String roomId, boolean hostAuthorized, boolean matchActive, int target, int cap, boolean deuce) {
            this.roomId = roomId == null ? "" : roomId;
            this.hostAuthorized = hostAuthorized;
            this.matchActive = matchActive;
            this.target = target;
            this.cap = cap;
            this.deuce = deuce;
        }

        boolean isReady() {
            return roomId.length() == 6 && hostAuthorized && matchActive;
        }
    }
}
