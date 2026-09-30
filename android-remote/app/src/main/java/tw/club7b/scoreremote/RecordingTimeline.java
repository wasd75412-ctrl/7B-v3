package tw.club7b.scoreremote;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class RecordingTimeline {
    static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");

    static final class Match {
        final long startMs;
        final long endMs;
        final String left;
        final String right;
        final int scoreA;
        final int scoreB;

        Match(long startMs, long endMs, String left, String right, int scoreA, int scoreB) {
            this.startMs = startMs;
            this.endMs = endMs;
            this.left = left;
            this.right = right;
            this.scoreA = scoreA;
            this.scoreB = scoreB;
        }
    }

    private RecordingTimeline() { }

    static List<Match> matchesFromRoom(Map<String, Object> room) {
        List<Match> matches = new ArrayList<>();
        if (room == null) return matches;
        Map<String, String> names = new HashMap<>();
        collectNames(room.get("retiredPlayers"), names);
        collectNames(room.get("roster"), names);
        Object history = room.get("history");
        if (!(history instanceof List)) return matches;
        for (Object item : (List<?>) history) {
            if (!(item instanceof Map)) continue;
            Map<?, ?> entry = (Map<?, ?>) item;
            if (Boolean.TRUE.equals(entry.get("testMode"))) continue;
            long start = parseTime(entry.get("startedAt"));
            if (start <= 0L) continue;
            long end = parseTime(entry.get("endedAt"));
            matches.add(new Match(start, end,
                    team(names, entry.get("teamA1"), entry.get("teamA2")),
                    team(names, entry.get("teamB1"), entry.get("teamB2")),
                    intValue(entry.get("scoreA")), intValue(entry.get("scoreB"))));
        }
        return matches;
    }

    static String timeline(List<Match> matches, long recordingStartMs, long recordingEndMs) {
        List<Match> included = new ArrayList<>();
        for (Match match : matches) {
            long end = match.endMs > 0L ? match.endMs : match.startMs;
            if (match.startMs < recordingEndMs && end > recordingStartMs) included.add(match);
        }
        Collections.sort(included, (a, b) -> Long.compare(a.startMs, b.startMs));
        StringBuilder text = new StringBuilder("00:00:00 準備與熱身");
        for (int i = 0; i < included.size(); i++) {
            Match match = included.get(i);
            long offset = Math.max(0L, (match.startMs - recordingStartMs) / 1000L);
            text.append('\n').append(formatOffset(offset)).append(" Game").append(i + 1).append(' ')
                    .append(match.left).append(' ').append(match.scoreA).append('：').append(match.scoreB)
                    .append(' ').append(match.right);
        }
        return text.toString();
    }

    static String formatOffset(long seconds) {
        long safe = Math.max(0L, seconds);
        return String.format(Locale.ROOT, "%02d:%02d:%02d", safe / 3600L, (safe % 3600L) / 60L, safe % 60L);
    }

    static String title(long startMs, int ordinal) {
        ZonedDateTime date = ZonedDateTime.ofInstant(Instant.ofEpochMilli(startMs), TAIPEI);
        String base = date.getYear() + "年" + date.getMonthValue() + "月" + date.getDayOfMonth() + "日";
        return ordinal > 1 ? base + "（" + ordinal + "）" : base;
    }

    static String dateKey(long startMs) {
        return ZonedDateTime.ofInstant(Instant.ofEpochMilli(startMs), TAIPEI).toLocalDate().toString();
    }

    private static void collectNames(Object players, Map<String, String> names) {
        if (!(players instanceof List)) return;
        for (Object item : (List<?>) players) {
            if (!(item instanceof Map)) continue;
            Object id = ((Map<?, ?>) item).get("id");
            Object name = ((Map<?, ?>) item).get("name");
            if (id != null && name != null && !String.valueOf(name).trim().isEmpty()) {
                names.put(String.valueOf(id), String.valueOf(name).trim());
            }
        }
    }

    private static String team(Map<String, String> names, Object first, Object second) {
        List<String> players = new ArrayList<>();
        for (Object id : new Object[]{first, second}) {
            if (id == null || String.valueOf(id).isEmpty()) continue;
            String key = String.valueOf(id);
            players.add(names.containsKey(key) ? names.get(key) : key);
        }
        return players.isEmpty() ? "—" : String.join("／", players);
    }

    private static long parseTime(Object value) {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value == null || String.valueOf(value).trim().isEmpty()) return 0L;
        try {
            return Instant.parse(String.valueOf(value).trim()).toEpochMilli();
        } catch (RuntimeException invalid) {
            return 0L;
        }
    }

    private static int intValue(Object value) {
        return value instanceof Number ? ((Number) value).intValue() : 0;
    }
}
