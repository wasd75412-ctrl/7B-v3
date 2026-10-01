package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public final class RecordingTimelineTest {
    private static Map<String, Object> player(String id, String name) {
        Map<String, Object> player = new HashMap<>();
        player.put("id", id);
        player.put("name", name);
        return player;
    }

    private static Map<String, Object> match(String startedAt, String endedAt, long scoreA, long scoreB, boolean testMode) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("startedAt", startedAt);
        entry.put("endedAt", endedAt);
        entry.put("teamA1", "a");
        entry.put("teamA2", "b");
        entry.put("teamB1", "c");
        entry.put("teamB2", "old");
        entry.put("scoreA", scoreA);
        entry.put("scoreB", scoreB);
        entry.put("testMode", testMode);
        return entry;
    }

    private static Map<String, Object> room() {
        Map<String, Object> room = new HashMap<>();
        room.put("roster", Arrays.asList(player("a", "建昱"), player("b", "于萱"), player("c", "Yoyo")));
        room.put("retiredPlayers", Arrays.asList(player("old", "澐緁")));
        List<Object> history = new ArrayList<>();
        history.add(match("2026-09-30T11:30:00.000Z", "2026-09-30T11:45:00.000Z", 9, 11, false));
        history.add(match("2026-09-30T11:10:05.000Z", "2026-09-30T11:25:00.000Z", 11, 7, false));
        history.add(match("2026-09-30T11:50:00.000Z", "2026-09-30T12:00:00.000Z", 11, 3, true));
        history.add(match("", "2026-09-30T12:05:00.000Z", 11, 5, false));
        history.add(match("2026-09-29T11:10:00.000Z", "2026-09-29T11:25:00.000Z", 11, 1, false));
        room.put("history", history);
        return room;
    }

    @Test
    public void buildsChaptersFromTheRecordingStart() {
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertEquals("00:00:00 準備與熱身\n"
                + "00:10:05 Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00 Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
    }

    @Test
    public void numbersGamesWithinEachVideo() {
        long start = Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertTrue(text.contains("00:02:00 Game1 建昱／于萱 9：11"));
        assertFalse(text.contains("Game2"));
    }

    @Test
    public void clampsAMatchThatStartedBeforeTheRecording() {
        long start = Instant.parse("2026-09-30T11:20:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertEquals("00:00:00 準備與熱身\n00:00:00 Game1 建昱／于萱 11：7 Yoyo／澐緁", text);
    }

    @Test
    public void includesAScreenOrRemoteOfficialStartBeforeTheMatchEnds() {
        Map<String, Object> room = room();
        Map<String, Object> live = new HashMap<>();
        live.put("startedAt", "2026-09-30T11:55:00.000Z");
        live.put("teamA", Arrays.asList("a", "b"));
        live.put("teamB", Arrays.asList("c"));
        live.put("scores", Arrays.asList(4L, 6L));
        room.put("match", live);
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room), start, end);
        assertTrue(text.contains("00:55:00 Game3 建昱／于萱 4：6 Yoyo"));
    }

    @Test
    public void doesNotRepeatAFinishedMatchAlreadyInHistory() {
        Map<String, Object> room = room();
        Map<String, Object> live = new HashMap<>();
        live.put("startedAt", "2026-09-30T11:10:05.000Z");
        live.put("teamA", Arrays.asList("a", "b"));
        live.put("teamB", Arrays.asList("c", "old"));
        live.put("scores", Arrays.asList(11L, 7L));
        room.put("match", live);
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room), start, end);
        assertFalse(text.contains("Game3"));
    }

    @Test
    public void includesMatchesArchivedOutsideTheRoomDocument() {
        Map<String, Object> room = room();
        ((List<Object>) room.get("history")).remove(1);
        Map<String, Object> archived = match("2026-09-30T11:10:05.000Z", "2026-09-30T11:25:00.000Z", 11, 7, false);
        archived.put("matchId", "archived-game");
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(
                RecordingTimeline.withArchivedHistory(room, Arrays.asList(archived))), start, end);
        assertEquals("00:00:00 準備與熱身\n"
                + "00:10:05 Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00 Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
        assertFalse(RecordingTimeline.hasGameChapter("00:00:00 準備與熱身"));
        assertTrue(RecordingTimeline.hasGameChapter(text));
    }

    @Test
    public void listsAMatchOnceWhenRoomHistoryAndArchiveBothContainIt() {
        Map<String, Object> room = room();
        Map<String, Object> archived = match("2026-09-30T11:10:05.000Z", "2026-09-30T11:25:00.000Z", 11, 7, false);
        archived.put("matchId", "different-id");
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(
                RecordingTimeline.withArchivedHistory(room, Arrays.asList(archived))), start, end);
        assertEquals("00:00:00 準備與熱身\n"
                + "00:10:05 Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00 Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
    }

    @Test
    public void titlesUseTheTaipeiDate() {
        long lateNight = Instant.parse("2026-09-30T16:30:00.000Z").toEpochMilli();
        assertEquals("2026年10月1日", RecordingTimeline.title(lateNight, 1));
        assertEquals("2026年10月1日（2）", RecordingTimeline.title(lateNight, 2));
        assertEquals("2026-10-01", RecordingTimeline.dateKey(lateNight));
        assertEquals("01:02:03", RecordingTimeline.formatOffset(3723L));
    }
}
