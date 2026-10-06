package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.google.firebase.firestore.FieldValue;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class ErrorLog {
    private static final String PREFS = "error_log_v1";
    private static final String KEY = "book";
    private static final Object LOCK = new Object();
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static final Runnable UPLOAD_TASK = ErrorLog::upload;
    private static Context appContext;
    private static ErrorLogBook book;
    private static boolean uploadPending;
    private static volatile boolean matchInProgress;

    private ErrorLog() { }

    static void install(Context context) {
        synchronized (LOCK) {
            appContext = context.getApplicationContext();
            loadLocked();
        }
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                synchronized (LOCK) {
                    if (loadLocked().record("crash", describe("", error), origin(error), System.currentTimeMillis())) {
                        saveLocked(true);
                    }
                }
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
        scheduleUpload();
    }

    static void record(Context context, String kind, String message, Throwable error) {
        try {
            synchronized (LOCK) {
                if (appContext == null && context != null) appContext = context.getApplicationContext();
                if (appContext == null) return;
                if (!loadLocked().record(kind, describe(message, error), origin(error), System.currentTimeMillis())) return;
                saveLocked(false);
            }
            scheduleUpload();
        } catch (RuntimeException ignored) {
        }
    }

    static void setMatchInProgress(boolean inProgress) {
        matchInProgress = inProgress;
    }

    private static void scheduleUpload() {
        HANDLER.post(() -> {
            if (uploadPending) return;
            synchronized (LOCK) {
                if (book == null || !book.dirty || book.reachedDailyUploads(today())) return;
            }
            uploadPending = true;
            HANDLER.postDelayed(UPLOAD_TASK, ErrorLogBook.UPLOAD_GAP_MS);
        });
    }

    // Uploads wait for a break between matches so a weak venue signal never queues them ahead of scores.
    private static void upload() {
        uploadPending = false;
        Context context;
        RemoteSessionStore.Session session;
        List<Map<String, Object>> entries;
        synchronized (LOCK) {
            context = appContext;
            if (context == null || book == null) return;
            session = RemoteSessionStore.getSession(context);
            long now = System.currentTimeMillis();
            String day = today();
            boolean ready = session.isAuthorized() && book.canUpload(matchInProgress, isOnline(context), now, day);
            if (!ready) {
                entries = null;
            } else {
                entries = payloadLocked();
                book.markUploaded(now, day);
                saveLocked(false);
            }
        }
        if (entries == null) {
            scheduleUpload();
            return;
        }
        String deviceId = LocalLinkClient.shared(context).deviceId();
        Map<String, Object> data = new HashMap<>();
        data.put("platform", "android");
        data.put("device", deviceId);
        data.put("version", versionName(context));
        data.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        data.put("entries", entries);
        data.put("updatedAt", FieldValue.serverTimestamp());
        try {
            BackgroundScoreController.firestore(context)
                    .collection("badmintonRooms").document(session.roomId)
                    .collection("remoteControl").document("errors-android-" + deviceId)
                    .set(data)
                    .addOnFailureListener(ignored -> { });
        } catch (RuntimeException ignored) {
        }
    }

    private static List<Map<String, Object>> payloadLocked() {
        List<Map<String, Object>> entries = new ArrayList<>();
        for (ErrorLogBook.Entry entry : book.entries) {
            Map<String, Object> item = new HashMap<>();
            item.put("k", entry.kind);
            item.put("m", entry.message);
            item.put("s", entry.source);
            item.put("n", entry.count);
            item.put("f", entry.first);
            item.put("l", entry.last);
            entries.add(item);
        }
        return entries;
    }

    private static ErrorLogBook loadLocked() {
        if (book != null) return book;
        book = new ErrorLogBook();
        if (appContext == null) return book;
        try {
            JSONObject json = new JSONObject(prefs().getString(KEY, "{}"));
            JSONArray entries = json.optJSONArray("entries");
            for (int i = 0; entries != null && i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry == null) continue;
                book.restore(new ErrorLogBook.Entry(entry.optString("k"), entry.optString("m"), entry.optString("s"),
                        entry.optInt("n", 1), entry.optLong("f"), entry.optLong("l")));
            }
            book.dirty = json.optBoolean("dirty") && !book.entries.isEmpty();
            book.lastUploadAt = json.optLong("lastUploadAt");
            book.uploadDay = json.optString("uploadDay");
            book.uploadsToday = json.optInt("uploadsToday");
        } catch (JSONException ignored) {
        }
        return book;
    }

    private static void saveLocked(boolean immediately) {
        if (appContext == null || book == null) return;
        try {
            JSONArray entries = new JSONArray();
            for (ErrorLogBook.Entry entry : book.entries) {
                entries.put(new JSONObject()
                        .put("k", entry.kind).put("m", entry.message).put("s", entry.source)
                        .put("n", entry.count).put("f", entry.first).put("l", entry.last));
            }
            JSONObject json = new JSONObject()
                    .put("entries", entries)
                    .put("dirty", book.dirty)
                    .put("lastUploadAt", book.lastUploadAt)
                    .put("uploadDay", book.uploadDay)
                    .put("uploadsToday", book.uploadsToday);
            SharedPreferences.Editor editor = prefs().edit().putString(KEY, json.toString());
            if (immediately) editor.commit();
            else editor.apply();
        } catch (JSONException ignored) {
        }
    }

    private static SharedPreferences prefs() {
        return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String describe(String message, Throwable error) {
        String text = message == null ? "" : message.trim();
        if (error == null) return text;
        Throwable root = error;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String detail = root.getClass().getSimpleName() + (root.getMessage() == null ? "" : " " + root.getMessage());
        return text.isEmpty() ? detail : text + ": " + detail;
    }

    static String origin(Throwable error) {
        if (error == null) return "";
        StackTraceElement fallback = null;
        for (StackTraceElement frame : error.getStackTrace()) {
            if (fallback == null) fallback = frame;
            if (frame.getClassName().startsWith("tw.club7b.")) return frameText(frame);
        }
        return fallback == null ? "" : frameText(fallback);
    }

    private static String frameText(StackTraceElement frame) {
        String className = frame.getClassName();
        return className.substring(className.lastIndexOf('.') + 1) + "." + frame.getMethodName() + ":" + frame.getLineNumber();
    }

    private static boolean isOnline(Context context) {
        try {
            ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network network = connectivity == null ? null : connectivity.getActiveNetwork();
            NetworkCapabilities capabilities = network == null ? null : connectivity.getNetworkCapabilities(network);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static String versionName(Context context) {
        try {
            String name = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            return name == null ? "" : name;
        } catch (Exception error) {
            return "";
        }
    }

    private static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    }
}
