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
        assertEquals("00:00:00  準備與熱身\n"
                + "00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00  Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
        assertTrue(RecordingTimeline.hasValidChapters(text));
    }

    @Test
    public void leavesPausedTimeOutOfChapterOffsets() {
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        List<long[]> pauses = Arrays.asList(
                new long[] {Instant.parse("2026-09-30T11:05:00.000Z").toEpochMilli(), Instant.parse("2026-09-30T11:08:00.000Z").toEpochMilli()},
                new long[] {Instant.parse("2026-09-30T11:26:00.000Z").toEpochMilli(), Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli()});
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end, pauses);
        assertEquals("00:00:00  準備與熱身\n"
                + "00:07:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:25:00  Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
        long midPause = Instant.parse("2026-09-30T11:06:00.000Z").toEpochMilli();
        assertEquals(5L * 60_000L, RecordingTimeline.videoMillis(midPause, start, pauses));
    }

    @Test
    public void leavesOutAMatchPlayedEntirelyWhilePaused() {
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        List<long[]> pauses = Arrays.<long[]>asList(new long[] {
                Instant.parse("2026-09-30T11:29:00.000Z").toEpochMilli(), Instant.parse("2026-09-30T11:46:00.000Z").toEpochMilli()});
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end, pauses);
        assertEquals("00:00:00  準備與熱身\n"
                + "00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:52:59  錄影結束", text);
        assertTrue(RecordingTimeline.hasValidChapters(text));
    }

    @Test
    public void leavesOutAMatchStartedDuringAPauseThatLastedUntilTheRecordingStopped() {
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T11:40:00.000Z").toEpochMilli();
        List<long[]> pauses = Arrays.<long[]>asList(new long[] {
                Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli(), end});
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end, pauses);
        assertEquals("00:00:00  準備與熱身\n"
                + "00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:27:59  錄影結束", text);
    }

    @Test
    public void dropsChaptersPushedPastTheEndOfTheVideo() {
        long start = 1_000_000L;
        List<RecordingTimeline.Match> matches = Arrays.asList(
                new RecordingTimeline.Match(start + 5_000L, 0L, "A", "B", 1, 0),
                new RecordingTimeline.Match(start + 6_000L, 0L, "C", "D", 2, 0),
                new RecordingTimeline.Match(start + 7_000L, 0L, "E", "F", 3, 0),
                new RecordingTimeline.Match(start + 8_000L, 0L, "G", "H", 4, 0));
        String text = RecordingTimeline.timeline(matches, start, start + 40_000L);
        assertEquals("00:00:00  準備與熱身\n"
                + "00:00:10  Game1 A 1：0 B\n"
                + "00:00:20  Game2 C 2：0 D\n"
                + "00:00:30  Game3 E 3：0 F", text);
        assertTrue(RecordingTimeline.hasValidChapters(text));
    }

    @Test
    public void keepsChaptersTenSecondsApartWhenALaterVideoStartsMidGame() {
        long start = Instant.parse("2026-09-30T11:20:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertEquals("00:00:00  準備與熱身\n"
                + "00:00:10  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:10:00  Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
        assertTrue(RecordingTimeline.hasValidChapters(text));
    }

    @Test
    public void numbersGamesWithinEachVideo() {
        long start = Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertTrue(text.contains("00:02:00  Game1 建昱／于萱 9：11"));
        assertFalse(text.contains("Game2"));
    }

    @Test
    public void clampsAMatchThatStartedBeforeTheRecording() {
        long start = Instant.parse("2026-09-30T11:20:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T11:28:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room()), start, end);
        assertEquals("00:00:00  準備與熱身\n00:00:10  Game1 建昱／于萱 11：7 Yoyo／澐緁\n00:07:59  錄影結束", text);
        assertFalse(RecordingTimeline.hasValidChapters("00:00:00  準備與熱身\n00:00:00  Game1 建昱／于萱 11：7 Yoyo／澐緁"));
        assertTrue(RecordingTimeline.hasValidChapters(text));
    }

    @Test
    public void countsOnlyGameChapters() {
        assertEquals(0, RecordingTimeline.gameCount(null));
        assertEquals(1, RecordingTimeline.gameCount("00:00:00  準備與熱身\n00:00:10  Game1 A 11：7 B\n00:07:59  錄影結束"));
        assertEquals(2, RecordingTimeline.gameCount("00:00:00  準備與熱身\n00:10:05  Game1 A 11：7 B\n00:30:00  Game2 A 9：11 B"));
        assertEquals(2, RecordingTimeline.gameCount("00:00:00 準備與熱身\n00:10:05 Game1 A 11：7 B\n00:30:00 Game2 A 9：11 B"));
        assertTrue(RecordingTimeline.hasValidChapters("00:00:00 準備與熱身\n00:10:05 Game1 A 11：7 B\n00:30:00 Game2 A 9：11 B"));
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
        assertTrue(text.contains("00:55:00  Game3 建昱／于萱 4：6 Yoyo"));
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
    public void readsRoomHistoryStoredWithTeamsAndScores() {
        Map<String, Object> room = new HashMap<>();
        room.put("roster", Arrays.asList(player("a", "建昱"), player("b", "于萱"), player("c", "Yoyo"), player("old", "澐緁")));
        Map<String, Object> entry = new HashMap<>();
        entry.put("startedAt", "2026-09-30T11:10:05.000Z");
        entry.put("endedAt", "2026-09-30T11:25:00.000Z");
        entry.put("teams", Arrays.asList(Arrays.asList("a", "b"), Arrays.asList("c", "old")));
        entry.put("scores", Arrays.asList(11L, 7L));
        room.put("history", Arrays.asList(entry));
        long start = Instant.parse("2026-09-30T11:00:00.000Z").toEpochMilli();
        long end = Instant.parse("2026-09-30T12:10:00.000Z").toEpochMilli();
        String text = RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room), start, end);
        assertEquals("00:00:00  準備與熱身\n00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n01:09:59  錄影結束", text);
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
        assertEquals("00:00:00  準備與熱身\n"
                + "00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00  Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
        assertFalse(RecordingTimeline.hasGameChapter("00:00:00  準備與熱身"));
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
        assertEquals("00:00:00  準備與熱身\n"
                + "00:10:05  Game1 建昱／于萱 11：7 Yoyo／澐緁\n"
                + "00:30:00  Game2 建昱／于萱 9：11 Yoyo／澐緁", text);
    }

    @Test
    public void keepsCompleteMatchesWhenARefreshTemporarilyReturnsLessData() {
        RecordingTimeline.Match finished = new RecordingTimeline.Match(1000L, 2000L, "A", "B", 11, 8);
        RecordingTimeline.Match next = new RecordingTimeline.Match(3000L, 0L, "C", "D", 4, 3);
        List<RecordingTimeline.Match> saved = Arrays.asList(finished, next);

        assertEquals(2, RecordingTimeline.preferMoreCompleteMatches(saved, new ArrayList<>()).size());

        RecordingTimeline.Match partial = new RecordingTimeline.Match(1000L, 0L, "A", "B", 2, 1);
        List<RecordingTimeline.Match> merged = RecordingTimeline.preferMoreCompleteMatches(saved, Arrays.asList(partial));
        assertEquals(2, merged.size());
        assertEquals(2000L, merged.get(0).endMs);
        assertEquals(11, merged.get(0).scoreA);
    }

    @Test
    public void acceptsNewerLiveProgressWhileKeepingEarlierGames() {
        RecordingTimeline.Match first = new RecordingTimeline.Match(1000L, 2000L, "A", "B", 11, 8);
        RecordingTimeline.Match live = new RecordingTimeline.Match(3000L, 0L, "C", "D", 4, 3);
        RecordingTimeline.Match updated = new RecordingTimeline.Match(3000L, 0L, "C", "D", 7, 5);

        List<RecordingTimeline.Match> merged = RecordingTimeline.preferMoreCompleteMatches(
                Arrays.asList(first, live), Arrays.asList(updated));
        assertEquals(2, merged.size());
        assertEquals(7, merged.get(1).scoreA);
        assertEquals(5, merged.get(1).scoreB);
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
