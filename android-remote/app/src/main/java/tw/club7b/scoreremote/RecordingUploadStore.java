package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RecordingUploadStore {
    static final long MIN_DURATION_MS = 30_000L;
    static final long TIMELINE_REFRESH_MS = 36L * 60L * 60L * 1000L;
    private static final String PREFS = "youtube_uploads";
    private static final String KEY_ENTRIES = "entries";
    private static final String KEY_PLAYLIST_ID = "playlistId";
    private static final int MAX_ENTRIES = 60;

    enum Status { WAITING, UPLOADING, UPLOADED, AUTH_REQUIRED, FAILED, MISSING }

    static final class Entry {
        String id = "";
        String uri = "";
        String roomId = "";
        long startMs;
        long endMs;
        Status status = Status.WAITING;
        String title = "";
        String description = "";
        String sessionUrl = "";
        String videoId = "";
        boolean playlistAdded;
        int progress;
        String message = "";

        boolean isPending() {
            return status == Status.WAITING || status == Status.UPLOADING || status == Status.AUTH_REQUIRED;
        }

        JSONObject toJson() throws JSONException {
            return new JSONObject()
                    .put("id", id).put("uri", uri).put("roomId", roomId)
                    .put("startMs", startMs).put("endMs", endMs).put("status", status.name())
                    .put("title", title).put("description", description).put("sessionUrl", sessionUrl)
                    .put("videoId", videoId).put("playlistAdded", playlistAdded)
                    .put("progress", progress).put("message", message);
        }

        static Entry fromJson(JSONObject json) {
            Entry entry = new Entry();
            entry.id = json.optString("id");
            entry.uri = json.optString("uri");
            entry.roomId = json.optString("roomId");
            entry.startMs = json.optLong("startMs");
            entry.endMs = json.optLong("endMs");
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
            entry.progress = json.optInt("progress");
            entry.message = json.optString("message");
            return entry;
        }
    }

    private RecordingUploadStore() { }

    static synchronized boolean add(Context context, Uri uri, String roomId, long startMs, long endMs) {
        if (uri == null || startMs <= 0L || endMs - startMs < MIN_DURATION_MS) return false;
        List<Entry> entries = read(context);
        Entry entry = new Entry();
        entry.id = String.valueOf(startMs);
        entry.uri = uri.toString();
        entry.roomId = roomId == null ? "" : roomId;
        entry.startMs = startMs;
        entry.endMs = endMs;
        entries.add(0, entry);
        while (entries.size() > MAX_ENTRIES) entries.remove(entries.size() - 1);
        write(context, entries);
        return true;
    }

    static synchronized List<Entry> all(Context context) {
        return read(context);
    }

    static synchronized List<Entry> pending(Context context) {
        List<Entry> pending = new ArrayList<>();
        for (Entry entry : read(context)) if (entry.isPending()) pending.add(entry);
        Collections.reverse(pending);
        return pending;
    }

    static synchronized List<Entry> timelineRefresh(Context context, long nowMs) {
        List<Entry> refresh = new ArrayList<>();
        for (Entry entry : read(context)) {
            if (entry.status != Status.UPLOADED || entry.videoId.isEmpty() || entry.roomId.isEmpty()) continue;
            if (RecordingTimeline.hasGameChapter(entry.description)) continue;
            if (nowMs - entry.endMs > TIMELINE_REFRESH_MS) continue;
            refresh.add(entry);
        }
        return refresh;
    }

    static synchronized void save(Context context, Entry updated) {
        List<Entry> entries = read(context);
        for (int i = 0; i < entries.size(); i++) {
            if (entries.get(i).id.equals(updated.id)) {
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

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
