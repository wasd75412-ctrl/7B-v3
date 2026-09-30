package tw.club7b.scoreremote;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class YouTubeUploaderTest {
    @Test
    public void resumesAfterTheLastReceivedByte() {
        assertEquals(0L, YouTubeUploader.nextOffset(null));
        assertEquals(8388608L, YouTubeUploader.nextOffset("bytes=0-8388607"));
        assertEquals(0L, YouTubeUploader.nextOffset("bytes=0-x"));
    }

    @Test
    public void chunksAreMultiplesOf256KiB() {
        assertEquals(0, YouTubeUploader.CHUNK_BYTES % (256 * 1024));
    }

    @Test
    public void removesCharactersYouTubeRejects() {
        assertEquals("2026年9月30日", YouTubeUploader.clean(" <2026年9月30日> ", 100));
        assertEquals("abc", YouTubeUploader.clean("abcdef", 3));
    }
}
