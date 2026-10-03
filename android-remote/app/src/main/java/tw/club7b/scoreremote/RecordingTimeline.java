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
        if (history instanceof List) {
            for (Object item : (List<?>) history) {
                if (!(item instanceof Map)) continue;
                matches.addAll(matchFrom((Map<?, ?>) item, names, true));
            }
        }
        Object current = room.get("match");
        if (current instanceof Map) {
            for (Match match : matchFrom((Map<?, ?>) current, names, false)) {
                boolean duplicate = false;
                for (Match existing : matches) if (existing.startMs == match.startMs) duplicate = true;
                if (!duplicate) matches.add(match);
            }
        }
        return matches;
    }

    static Map<String, Object> withArchivedHistory(Map<String, Object> room, List<? extends Map<String, Object>> archived) {
        Map<String, Object> merged = new HashMap<>();
        if (room != null) merged.putAll(room);
        List<Object> history = new ArrayList<>();
        Object existing = merged.get("history");
        if (existing instanceof List) history.addAll((List<?>) existing);
        if (archived != null) {
            for (Map<String, Object> row : archived) {
                if (row == null || Boolean.TRUE.equals(row.get("testMode"))) continue;
                Object id = row.get("matchId");
                String matchId = id == null ? "" : String.valueOf(id);
                if (!matchId.isEmpty() && historyContains(history, matchId)) continue;
                if (historyContainsStart(history, row.get("startedAt"))) continue;
                history.add(row);
            }
        }
        merged.put("history", history);
        return merged;
    }

    static boolean hasGameChapter(String description) {
        return description != null && description.contains("Game");
    }

    static int gameCount(String description) {
        if (description == null) return 0;
        int count = 0;
        for (String line : description.split("\\n")) if (line.matches("\\d{2}:\\d{2}:\\d{2} Game\\d+ .*")) count++;
        return count;
    }

    private static boolean historyContains(List<Object> history, String matchId) {
        for (Object item : history) {
            if (item instanceof Map && matchId.equals(String.valueOf(((Map<?, ?>) item).get("matchId")))) return true;
        }
        return false;
    }

    private static boolean historyContainsStart(List<Object> history, Object startedAt) {
        String start = startedAt == null ? "" : String.valueOf(startedAt).trim();
        if (start.isEmpty()) return false;
        for (Object item : history) {
            if (item instanceof Map && start.equals(String.valueOf(((Map<?, ?>) item).get("startedAt")).trim())) return true;
        }
        return false;
    }

    private static List<Match> matchFrom(Map<?, ?> entry, Map<String, String> names, boolean historyScores) {
        List<Match> matches = new ArrayList<>();
        if (Boolean.TRUE.equals(entry.get("testMode"))) return matches;
        long start = parseTime(entry.get("startedAt"));
        if (start <= 0L) return matches;
        int[] scores = scores(entry, historyScores);
        matches.add(new Match(start, parseTime(entry.get("endedAt")),
                side(names, entry.get("teamA"), entry.get("teamA1"), entry.get("teamA2")),
                side(names, entry.get("teamB"), entry.get("teamB1"), entry.get("teamB2")),
                scores[0], scores[1]));
        return matches;
    }

    static String timeline(List<Match> matches, long recordingStartMs, long recordingEndMs) {
        List<Match> included = new ArrayList<>();
        for (Match match : matches) {
            long end = match.endMs > 0L ? match.endMs : Long.MAX_VALUE;
            if (match.startMs < recordingEndMs && end > recordingStartMs) included.add(match);
        }
        Collections.sort(included, (a, b) -> Long.compare(a.startMs, b.startMs));
        List<Match> unique = new ArrayList<>();
        long previousStart = Long.MIN_VALUE;
        for (Match match : included) {
            if (match.startMs == previousStart) continue;
            unique.add(match);
            previousStart = match.startMs;
        }
        included = unique;
        StringBuilder text = new StringBuilder("00:00:00 準備與熱身");
        long previous = 0L;
        for (int i = 0; i < included.size(); i++) {
            Match match = included.get(i);
            long offset = Math.max(0L, (match.startMs - recordingStartMs) / 1000L);
            if (offset < previous + 10L) offset = previous + 10L;
            previous = offset;
            text.append('\n').append(formatOffset(offset)).append(" Game").append(i + 1).append(' ')
                    .append(match.left).append(' ').append(match.scoreA).append('：').append(match.scoreB)
                    .append(' ').append(match.right);
        }
        appendEndChapter(text, previous, recordingStartMs, recordingEndMs);
        return text.toString();
    }

    private static void appendEndChapter(StringBuilder text, long previous, long recordingStartMs, long recordingEndMs) {
        String current = text.toString();
        int lines = current.split("\\n").length;
        if (lines >= 3 || !current.contains("Game")) return;
        long duration = Math.max(0L, (recordingEndMs - recordingStartMs) / 1000L);
        long offset = duration - 1L;
        if (offset < previous + 10L) offset = previous + 10L;
        if (offset < previous + 10L || offset >= duration) return;
        text.append('\n').append(formatOffset(offset)).append(" 錄影結束");
    }

    static boolean hasValidChapters(String description) {
        if (description == null || description.isEmpty()) return false;
        String[] lines = description.split("\\n");
        if (lines.length < 3 || !hasGameChapter(description)) return false;
        long previous = -1L;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            int space = line.indexOf(' ');
            if (space <= 0) return false;
            long seconds = parseOffset(line.substring(0, space));
            if (seconds < 0L) return false;
            if (i == 0 && seconds != 0L) return false;
            if (i > 0 && seconds < previous + 10L) return false;
            previous = seconds;
        }
        return true;
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

    private static String side(Map<String, String> names, Object players, Object first, Object second) {
        if (players instanceof List) {
            List<String> labels = new ArrayList<>();
            for (Object id : (List<?>) players) {
                if (id == null || String.valueOf(id).isEmpty()) continue;
                String key = String.valueOf(id);
                labels.add(names.containsKey(key) ? names.get(key) : key);
            }
            if (!labels.isEmpty()) return String.join("／", labels);
        }
        return team(names, first, second);
    }

    private static int[] scores(Map<?, ?> entry, boolean historyScores) {
        Object value = entry.get("scores");
        if (!historyScores && value instanceof List) {
            List<?> scores = (List<?>) value;
            return new int[]{
                    scores.isEmpty() ? 0 : intValue(scores.get(0)),
                    scores.size() < 2 ? 0 : intValue(scores.get(1))
            };
        }
        return new int[]{intValue(entry.get("scoreA")), intValue(entry.get("scoreB"))};
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

    private static long parseOffset(String value) {
        String[] parts = value.split(":");
        if (parts.length != 3) return -1L;
        try {
            long hours = Long.parseLong(parts[0]);
            long minutes = Long.parseLong(parts[1]);
            long seconds = Long.parseLong(parts[2]);
            if (hours < 0L || minutes < 0L || minutes > 59L || seconds < 0L || seconds > 59L) return -1L;
            return hours * 3600L + minutes * 60L + seconds;
        } catch (NumberFormatException invalid) {
            return -1L;
        }
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
