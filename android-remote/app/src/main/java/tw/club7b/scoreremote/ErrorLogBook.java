package tw.club7b.scoreremote;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

final class ErrorLogBook {
    static final int MAX_ENTRIES = 30;
    static final long UPLOAD_GAP_MS = 60_000L;
    static final int DAILY_UPLOADS = 30;
    private static final int MESSAGE_LIMIT = 160;
    private static final int SOURCE_LIMIT = 80;
    private static final int KIND_LIMIT = 16;

    static final class Entry {
        final String kind;
        final String message;
        final String source;
        final int count;
        final long first;
        final long last;

        Entry(String kind, String message, String source, int count, long first, long last) {
            this.kind = kind;
            this.message = message;
            this.source = source;
            this.count = count;
            this.first = first;
            this.last = last;
        }

        String signature() {
            return ErrorLogBook.signature(kind, message, source);
        }
    }

    final List<Entry> entries = new ArrayList<>();
    boolean dirty;
    long lastUploadAt;
    String uploadDay = "";
    int uploadsToday;

    static String clip(String value, int limit) {
        if (value == null) return "";
        String text = value.replaceAll("\\s+", " ").trim();
        return text.length() > limit ? text.substring(0, limit) : text;
    }

    // Messages that differ only by counters or ids collapse into one entry with a repeat count.
    static String signature(String kind, String message, String source) {
        return kind + "|" + message.replaceAll("\\d+", "#") + "|" + source.replaceAll("\\d+", "#");
    }

    boolean record(String kind, String message, String source, long now) {
        String m = clip(message, MESSAGE_LIMIT);
        if (m.isEmpty()) return false;
        String k = clip(kind, KIND_LIMIT);
        if (k.isEmpty()) k = "error";
        String s = clip(source, SOURCE_LIMIT);
        String signature = signature(k, m, s);
        Entry previous = null;
        for (Iterator<Entry> iterator = entries.iterator(); iterator.hasNext(); ) {
            Entry entry = iterator.next();
            if (!entry.signature().equals(signature)) continue;
            previous = entry;
            iterator.remove();
            break;
        }
        entries.add(previous == null
                ? new Entry(k, m, s, 1, now, now)
                : new Entry(k, m, s, previous.count + 1, previous.first, now));
        while (entries.size() > MAX_ENTRIES) entries.remove(0);
        dirty = true;
        return true;
    }

    void restore(Entry entry) {
        String m = clip(entry.message, MESSAGE_LIMIT);
        if (m.isEmpty()) return;
        String k = clip(entry.kind, KIND_LIMIT);
        entries.add(new Entry(k.isEmpty() ? "error" : k, m, clip(entry.source, SOURCE_LIMIT),
                Math.max(1, entry.count), Math.max(0, entry.first), Math.max(0, entry.last)));
        while (entries.size() > MAX_ENTRIES) entries.remove(0);
    }

    // Uploads wait for a break between matches so a weak venue signal never queues them ahead of scores.
    boolean canUpload(boolean matchInProgress, boolean online, long now, String day) {
        if (!dirty || matchInProgress || !online) return false;
        if (now - lastUploadAt < UPLOAD_GAP_MS) return false;
        return !reachedDailyUploads(day);
    }

    boolean reachedDailyUploads(String day) {
        return day.equals(uploadDay) && uploadsToday >= DAILY_UPLOADS;
    }

    void markUploaded(long now, String day) {
        uploadsToday = day.equals(uploadDay) ? uploadsToday + 1 : 1;
        uploadDay = day;
        lastUploadAt = now;
        dirty = false;
    }
}
