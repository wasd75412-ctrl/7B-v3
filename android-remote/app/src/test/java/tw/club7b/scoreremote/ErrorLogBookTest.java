package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ErrorLogBookTest {
    private static final String DAY = "2026-10-06";

    @Test
    public void repeatedErrorsDifferingOnlyByNumbersCollapse() {
        ErrorLogBook book = new ErrorLogBook();
        book.record("score", "Connection failed 1 times", "", 1000L);
        book.record("score", "Connection failed 2 times", "", 2000L);
        assertEquals(1, book.entries.size());
        ErrorLogBook.Entry entry = book.entries.get(0);
        assertEquals(2, entry.count);
        assertEquals(1000L, entry.first);
        assertEquals(2000L, entry.last);
        assertEquals("Connection failed 2 times", entry.message);
        assertTrue(book.dirty);
    }

    @Test
    public void entriesStaySmallAndCapped() {
        ErrorLogBook book = new ErrorLogBook();
        StringBuilder longText = new StringBuilder();
        for (int i = 0; i < 400; i++) longText.append('y');
        for (int i = 0; i < ErrorLogBook.MAX_ENTRIES + 10; i++) {
            book.record("score", "錯誤" + "x".repeat(i) + longText, longText.toString(), i);
        }
        assertEquals(ErrorLogBook.MAX_ENTRIES, book.entries.size());
        for (ErrorLogBook.Entry entry : book.entries) {
            assertTrue(entry.message.length() <= 160);
            assertTrue(entry.source.length() <= 80);
        }
    }

    @Test
    public void blankMessagesAreIgnored() {
        ErrorLogBook book = new ErrorLogBook();
        assertFalse(book.record("score", "   ", "", 0L));
        assertFalse(book.dirty);
    }

    @Test
    public void uploadsWaitForBreakConnectionGapAndDailyCap() {
        ErrorLogBook book = new ErrorLogBook();
        book.record("score", "網路較慢", "", 0L);
        long gap = ErrorLogBook.UPLOAD_GAP_MS;
        assertFalse(book.canUpload(true, true, gap, DAY));
        assertFalse(book.canUpload(false, false, gap, DAY));
        assertTrue(book.canUpload(false, true, gap, DAY));
        book.markUploaded(gap, DAY);
        assertFalse("nothing new to send", book.canUpload(false, true, gap * 3, DAY));
        book.record("score", "另一個錯誤", "", gap + 1);
        assertFalse("within a minute", book.canUpload(false, true, gap + gap / 2, DAY));
        assertTrue(book.canUpload(false, true, gap * 2, DAY));
        book.uploadsToday = ErrorLogBook.DAILY_UPLOADS;
        assertTrue(book.reachedDailyUploads(DAY));
        assertFalse(book.canUpload(false, true, gap * 10, DAY));
        assertTrue(book.canUpload(false, true, gap * 10, "2026-10-07"));
        book.markUploaded(gap * 10, "2026-10-07");
        assertEquals(1, book.uploadsToday);
    }
}
