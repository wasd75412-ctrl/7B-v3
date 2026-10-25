package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RecordingUploadStore {
    static final long MIN_DURATION_MS = 30_000L;
    static final long TIMELINE_REFRESH_MS = 36L * 60L * 60L * 1000L;
    static final long MERGE_SLACK_MS = 60_000L;
    private static final String PREFS = "youtube_uploads";
    private static final String KEY_ENTRIES = "entries";
    private static final String KEY_PLAYLIST_ID = "playlistId";
    private static final String KEY_LARGE_SESSION_RESET = "largeSessionReset";
    private static final String KEY_HTTP_FAILURE_RETRY = "httpFailureRetry";
    private static final Object LARGE_FILE_REPAIR = new Object();
    private static final int MAX_ENTRIES = 60;

    enum Status { WAITING, UPLOADING, UPLOADED, AUTH_REQUIRED, FAILED, MISSING }

    static final class Entry {
        String id = "";
        String uri = "";
        String roomId = "";
        long startMs;
        long endMs;
        List<long[]> pauses = new ArrayList<>();
        Status status = Status.WAITING;
        String title = "";
        String description = "";
        String sessionUrl = "";
        String videoId = "";
        boolean playlistAdded;
        boolean forceUpload;
        boolean audioBalanced;
        int progress;
        String message = "";

        boolean isPending() {
            return status == Status.WAITING || status == Status.UPLOADING || status == Status.AUTH_REQUIRED;
        }

        /** Auto-upload only today's clips; a manual tap or an in-flight upload can still push older ones. */
        boolean mayAutoUpload(long nowMs) {
            if (forceUpload) return true;
            if (status == Status.UPLOADING) return true;
            // Finish playlist/description for a video already on YouTube; do not resume old session URLs.
            if (!videoId.isEmpty()) return true;
            return RecordingTimeline.sameDay(startMs, nowMs);
        }

        JSONObject toJson() throws JSONException {
            JSONArray pauseArray = new JSONArray();
            for (long[] pause : pauses) pauseArray.put(new JSONArray().put(pause[0]).put(pause[1]));
            return new JSONObject()
                    .put("id", id).put("uri", uri).put("roomId", roomId)
                    .put("startMs", startMs).put("endMs", endMs).put("pauses", pauseArray).put("status", status.name())
                    .put("title", title).put("description", description).put("sessionUrl", sessionUrl)
                    .put("videoId", videoId).put("playlistAdded", playlistAdded).put("forceUpload", forceUpload)
                    .put("audioBalanced", audioBalanced)
                    .put("progress", progress).put("message", message);
        }

        static Entry fromJson(JSONObject json) {
            Entry entry = new Entry();
            entry.id = json.optString("id");
            entry.uri = json.optString("uri");
            entry.roomId = json.optString("roomId");
            entry.startMs = json.optLong("startMs");
            entry.endMs = json.optLong("endMs");
            JSONArray pauseArray = json.optJSONArray("pauses");
            if (pauseArray != null) {
                for (int i = 0; i < pauseArray.length(); i++) {
                    JSONArray pause = pauseArray.optJSONArray(i);
                    if (pause != null && pause.length() >= 2) entry.pauses.add(new long[] {pause.optLong(0), pause.optLong(1)});
                }
            }
            try {
                entry.status = Status.valueOf(json.optString("status", Status.WAITING.name()));
            } catch (IllegalArgumentException unknown) {
                entry.status = Status.WAITING;
            }
            entry.title = json.optString("title");
            entry.description = json.optString("description");
            entry.sessionUrl = json.optString("sessionUrl");
            entry.videoId = json.optString("videoId");
            entry.playlistAdded = json.optBoolean("playlistAdded");
            entry.forceUpload = json.optBoolean("forceUpload");
            entry.audioBalanced = json.optBoolean("audioBalanced");
            entry.progress = json.optInt("progress");
            entry.message = json.optString("message");
            return entry;
        }
    }

    private RecordingUploadStore() { }

    static synchronized boolean add(Context context, Uri uri, String roomId, long startMs, long endMs, List<long[]> pauses) {
        Entry entry = newEntry(uri, roomId, startMs, endMs, pauses);
        if (entry == null) return false;
        List<Entry> entries = read(context);
        entries.add(0, entry);
        while (entries.size() > MAX_ENTRIES) entries.remove(entries.size() - 1);
        write(context, entries);
        return true;
    }

    /** A merged video takes the place of the queued pieces it was joined from. */
    static synchronized boolean addMerged(Context context, Uri uri, String roomId, long startMs, long endMs, List<long[]> pauses) {
        Entry entry = newEntry(uri, roomId, startMs, endMs, pauses);
        if (entry == null) return false;
        List<Entry> entries = read(context);
        for (int i = entries.size() - 1; i >= 0; i--) {
            if (supersededBy(entries.get(i), startMs, endMs)) entries.remove(i);
        }
        int index = 0;
        while (index < entries.size() && entries.get(index).startMs > startMs) index++;
        entries.add(index, entry);
        while (entries.size() > MAX_ENTRIES) entries.remove(entries.size() - 1);
        write(context, entries);
        return true;
    }

    // Uploaded pieces stay: their YouTube copies already exist and deleting the entry would orphan them.
    static boolean supersededBy(Entry entry, long startMs, long endMs) {
        return entry.status != Status.UPLOADED
                && entry.startMs >= startMs - MERGE_SLACK_MS
                && entry.endMs <= endMs + MERGE_SLACK_MS;
    }

    private static Entry newEntry(Uri uri, String roomId, long startMs, long endMs, List<long[]> pauses) {
        if (uri == null || startMs <= 0L
                || RecordingTimeline.videoMillis(endMs, startMs, pauses) < MIN_DURATION_MS) return null;
        Entry entry = new Entry();
        entry.id = String.valueOf(startMs);
        entry.uri = uri.toString();
        entry.roomId = roomId == null ? "" : roomId;
        entry.startMs = startMs;
        entry.endMs = endMs;
        if (pauses != null) entry.pauses = new ArrayList<>(pauses);
        return entry;
    }

    static synchronized List<Entry> all(Context context) {
        return read(context);
    }

    static synchronized List<Entry> pending(Context context) {
        return pending(context, System.currentTimeMillis(), false);
    }

    static synchronized List<Entry> pendingAuto(Context context) {
        return pending(context, System.currentTimeMillis(), true);
    }

    static synchronized List<Entry> pending(Context context, long nowMs, boolean autoOnly) {
        List<Entry> pending = new ArrayList<>();
        for (Entry entry : read(context)) {
            if (!entry.isPending()) continue;
            if (autoOnly && !entry.mayAutoUpload(nowMs)) continue;
            pending.add(entry);
        }
        Collections.reverse(pending);
        return pending;
    }

    static synchronized void markOlderWaiting(Context context, long nowMs) {
        for (Entry entry : read(context)) {
            if (!entry.isPending() || entry.mayAutoUpload(nowMs)) continue;
            if ("僅今日自動上傳".equals(entry.message)) continue;
            entry.message = "僅今日自動上傳";
            save(context, entry);
        }
    }

    static synchronized List<Entry> timelineRefresh(Context context, long nowMs) {
        List<Entry> refresh = new ArrayList<>();
        for (Entry entry : read(context)) {
            if (entry.status != Status.UPLOADED || entry.videoId.isEmpty() || entry.roomId.isEmpty()) continue;
            if (nowMs - entry.endMs > TIMELINE_REFRESH_MS) continue;
            refresh.add(entry);
        }
        return refresh;
    }

    static synchronized void remove(Context context, String id) {
        if (id == null || id.isEmpty()) return;
        List<Entry> entries = read(context);
        boolean changed = false;
        for (int i = entries.size() - 1; i >= 0; i--) {
            if (id.equals(entries.get(i).id)) {
                entries.remove(i);
                changed = true;
            }
        }
        if (changed) write(context, entries);
    }

    // A merged video reuses the id of its first piece, so the file must match too.
    static boolean sameRecording(Entry a, Entry b) {
        return a.id.equals(b.id) && a.uri.equals(b.uri);
    }

    static synchronized boolean contains(Context context, Entry target) {
        for (Entry entry : read(context)) if (sameRecording(entry, target)) return true;
        return false;
    }

    static synchronized void markAudioReady(Context context, Uri uri) {
        if (uri == null) return;
        String text = uri.toString();
        List<Entry> entries = read(context);
        boolean changed = false;
        for (Entry entry : entries) {
            if (!text.equals(entry.uri) || entry.audioBalanced) continue;
            entry.audioBalanced = true;
            changed = true;
        }
        if (changed) write(context, entries);
    }

    /** Points a queued upload at the rewritten file. An existing resumable session belongs to the old bytes. */
    static synchronized boolean replaceUri(Context context, String id, String previousUri, String nextUri, boolean ready) {
        List<Entry> entries = read(context);
        for (Entry entry : entries) {
            if (!entry.id.equals(id) || !entry.uri.equals(previousUri)) continue;
            entry.uri = nextUri;
            entry.sessionUrl = "";
            entry.audioBalanced = ready;
            write(context, entries);
            return true;
        }
        return false;
    }

    static synchronized void save(Context context, Entry updated) {
        List<Entry> entries = read(context);
        for (int i = 0; i < entries.size(); i++) {
            if (sameRecording(entries.get(i), updated)) {
                entries.set(i, updated);
                write(context, entries);
                return;
            }
        }
    }

    static synchronized void retry(Context context, String id) {
        for (Entry entry : read(context)) {
            if (!entry.id.equals(id)) continue;
            entry.status = Status.WAITING;
            entry.forceUpload = true;
            entry.message = "";
            save(context, entry);
            return;
        }
    }

    /** Keeps the title and timeline so the new copy matches the old one. */
    static synchronized void reupload(Context context, String id) {
        for (Entry entry : read(context)) {
            if (!entry.id.equals(id)) continue;
            entry.videoId = "";
            entry.sessionUrl = "";
            entry.playlistAdded = false;
            entry.progress = 0;
            entry.status = Status.WAITING;
            entry.forceUpload = true;
            entry.message = "";
            save(context, entry);
            return;
        }
    }

    static synchronized void forceUpload(Context context, String id) {
        for (Entry entry : read(context)) {
            if (!entry.id.equals(id)) continue;
            entry.status = Status.WAITING;
            entry.forceUpload = true;
            entry.message = "";
            save(context, entry);
            return;
        }
    }

    static synchronized int ordinal(Context context, Entry target) {
        String date = RecordingTimeline.dateKey(target.startMs);
        int ordinal = 1;
        for (Entry entry : read(context)) {
            if (entry.startMs < target.startMs && date.equals(RecordingTimeline.dateKey(entry.startMs))) ordinal++;
        }
        return ordinal;
    }

    static synchronized String playlistId(Context context) {
        return prefs(context).getString(KEY_PLAYLIST_ID, "");
    }

    static synchronized void setPlaylistId(Context context, String playlistId) {
        prefs(context).edit().putString(KEY_PLAYLIST_ID, playlistId == null ? "" : playlistId).apply();
    }

    private static List<Entry> read(Context context) {
        List<Entry> entries = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs(context).getString(KEY_ENTRIES, "[]"));
            for (int i = 0; i < array.length(); i++) {
                JSONObject json = array.optJSONObject(i);
                if (json != null) entries.add(Entry.fromJson(json));
            }
        } catch (JSONException corrupted) {
            entries.clear();
        }
        return entries;
    }

    private static void write(Context context, List<Entry> entries) {
        JSONArray array = new JSONArray();
        try {
            for (Entry entry : entries) array.put(entry.toJson());
        } catch (JSONException ignored) {
            return;
        }
        prefs(context).edit().putString(KEY_ENTRIES, array.toString()).commit();
    }

    /** Earlier builds stored the daily upload limit as a permanent HTTP 400 failure. */
    static synchronized void reopenHttpFailures(Context context) {
        SharedPreferences preferences = prefs(context);
        if (preferences.getBoolean(KEY_HTTP_FAILURE_RETRY, false)) return;
        List<Entry> entries = read(context);
        boolean changed = false;
        for (Entry entry : entries) {
            if (entry.status != Status.FAILED || !entry.message.startsWith("HTTP ")) continue;
            entry.sessionUrl = "";
            entry.status = Status.WAITING;
            entry.message = "";
            entry.progress = 0;
            changed = true;
        }
        if (changed) write(context, entries);
        preferences.edit().putBoolean(KEY_HTTP_FAILURE_RETRY, true).commit();
    }

    /** Rewrites 32-bit indexes left by Android 9 and drops upload sessions opened against those files. */
    static void repairLargeFiles(Context context) {
        synchronized (LARGE_FILE_REPAIR) {
            SharedPreferences preferences = prefs(context);
            boolean resetSessions = !preferences.getBoolean(KEY_LARGE_SESSION_RESET, false);
            List<Entry> entries = read(context);
            boolean changed = false;
            boolean failed = false;
            for (Entry entry : entries) {
                if (!entry.videoId.isEmpty() || entry.uri.isEmpty()) continue;
                try {
                    Uri uri = Uri.parse(entry.uri);
                    long before = fileLength(context, uri);
                    boolean repaired = before > 0xFFFFFFFFL
                            && Mp4LargeOffsetRepair.repair(context.getContentResolver(), uri);
                    if (repaired && fileLength(context, uri) != before) {
                        entry.sessionUrl = "";
                        reopenFailed(entry);
                        changed = true;
                    } else if (resetSessions && before > 0xFFFFFFFFL
                            && (!entry.sessionUrl.isEmpty() || entry.status == Status.FAILED)) {
                        entry.sessionUrl = "";
                        reopenFailed(entry);
                        changed = true;
                    }
                } catch (FileNotFoundException missing) {
                    Log.w("7BRecording", "Recording is missing while repairing its index", missing);
                } catch (RuntimeException | IOException error) {
                    failed = true;
                    Log.w("7BRecording", "Unable to repair recording index", error);
                    ErrorLog.record(context, "recording", "影片索引修正失敗", error);
                }
            }
            if (changed) write(context, entries);
            if (resetSessions && !failed) preferences.edit().putBoolean(KEY_LARGE_SESSION_RESET, true).commit();
        }
    }

    private static void reopenFailed(Entry entry) {
        if (entry.status != Status.FAILED) return;
        entry.status = Status.WAITING;
        entry.message = "";
        entry.progress = 0;
    }

    private static long fileLength(Context context, Uri uri) throws IOException {
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(uri, "r")) {
            if (descriptor == null) throw new FileNotFoundException(uri.toString());
            long size = descriptor.getStatSize();
            if (size <= 0L) throw new FileNotFoundException(uri.toString());
            return size;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
