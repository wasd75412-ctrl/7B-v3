package tw.club7b.scoreremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import org.junit.Test;

public final class AudioClockAlignerTest {
    private static final int VIDEO_FRAMES = 18_000;

    @Test
    public void rescalesVideoToEndWithTheSlowAudioClock() throws Exception {
        File file = movie(28_122);
        assertTrue(align(file));

        byte[] bytes = Files.readAllBytes(file.toPath());
        List<AudioClockAligner.Box> top = AudioClockAligner.parse(bytes, 0, bytes.length);
        assertEquals("free", top.get(2).type);
        assertEquals("moov", top.get(3).type);

        AudioClockAligner.Box moov = top.get(3);
        AudioClockAligner.Box video = moov.children("trak").get(0);
        byte[] stts = video.child("mdia").child("minf").child("stbl").child("stts").payload;
        ByteBuffer table = ByteBuffer.wrap(stts);
        long frames = 0, ticks = 0;
        for (int index = 0; index < table.getInt(4); index++) {
            long count = table.getInt(8 + index * 8), delta = table.getInt(12 + index * 8);
            assertTrue(delta == 2999 || delta == 3000);
            frames += count;
            ticks += count * delta;
        }
        assertEquals(VIDEO_FRAMES, frames);
        double audioEnd = 0.002 + 28_122 * 1024 / 48_000.0;
        assertEquals(audioEnd, ticks / 90_000.0, 1 / 90_000.0);
        assertEquals(ticks, ByteBuffer.wrap(video.child("mdia").child("mdhd").payload).getInt(16));
        assertEquals(Math.max(Math.round(ticks / 90.0), 2 + 28_122 * 64 / 3),
                ByteBuffer.wrap(moov.child("mvhd").payload).getInt(16));
        assertEquals(Math.round(ticks / 90.0), ByteBuffer.wrap(video.child("tkhd").payload).getInt(20));

        assertFalse(align(file));
        assertArrayEquals(bytes, Files.readAllBytes(file.toPath()));
    }

    @Test
    public void leavesShortDriftUntouched() throws Exception {
        File file = movie(28_124);
        byte[] before = Files.readAllBytes(file.toPath());
        assertFalse(align(file));
        assertArrayEquals(before, Files.readAllBytes(file.toPath()));
    }

    @Test
    public void ignoresGapsTooLargeToBeClockDrift() throws Exception {
        File file = movie(27_900);
        byte[] before = Files.readAllBytes(file.toPath());
        assertFalse(align(file));
        assertArrayEquals(before, Files.readAllBytes(file.toPath()));
    }

    private static boolean align(File file) throws Exception {
        try (RandomAccessFile access = new RandomAccessFile(file, "rw")) {
            return AudioClockAligner.align(AudioClockAligner.channelStorage(access.getChannel()));
        }
    }

    /** 600 s of 30 fps video plus AAC frames at 48 kHz that start 2 ms late. */
    private static File movie(int audioFrames) throws Exception {
        byte[] moov = box("moov",
                box("mvhd", header(100, 1_000, 600_000)),
                trak(header(84, 0, 600_000), mdhd(90_000, VIDEO_FRAMES * 3_000L), "vide", null,
                        stts(VIDEO_FRAMES, 3_000)),
                trak(header(84, 0, 2 + audioFrames * 64 / 3), mdhd(48_000, audioFrames * 1_024L), "soun",
                        box("edts", box("elst", elst(2, -1))), stts(audioFrames, 1_024)));
        File file = File.createTempFile("aligner", ".mp4");
        file.deleteOnExit();
        Files.write(file.toPath(), concat(box("ftyp", new byte[20]), box("mdat", new byte[4_096]), moov));
        return file;
    }

    private static byte[] trak(byte[] tkhd, byte[] mdhd, String handler, byte[] edts, byte[] stts) {
        byte[] hdlr = new byte[25];
        System.arraycopy(handler.getBytes(StandardCharsets.ISO_8859_1), 0, hdlr, 8, 4);
        byte[] mdia = box("mdia", box("mdhd", mdhd), box("hdlr", hdlr), box("minf", box("stbl", box("stts", stts))));
        return edts == null ? box("trak", box("tkhd", tkhd), mdia) : box("trak", box("tkhd", tkhd), edts, mdia);
    }

    /** Version 0 header whose timescale sits at 12 (mvhd) and duration at 16, or 20 for tkhd. */
    private static byte[] header(int length, int timescale, int duration) {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        if (length == 84) buffer.putInt(20, duration);
        else buffer.putInt(12, timescale).putInt(16, duration);
        return buffer.array();
    }

    private static byte[] mdhd(int timescale, long duration) {
        return ByteBuffer.allocate(24).putInt(12, timescale).putInt(16, (int) duration).array();
    }

    private static byte[] stts(int count, int delta) {
        return ByteBuffer.allocate(16).putInt(4, 1).putInt(8, count).putInt(12, delta).array();
    }

    private static byte[] elst(int segmentDuration, int mediaTime) {
        return ByteBuffer.allocate(20).putInt(4, 1).putInt(8, segmentDuration).putInt(12, mediaTime).putInt(16, 0x10000).array();
    }

    private static byte[] box(String type, byte[]... parts) {
        byte[] body = concat(parts);
        return ByteBuffer.allocate(8 + body.length).putInt(8 + body.length)
                .put(type.getBytes(StandardCharsets.ISO_8859_1)).put(body).array();
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) out.write(part, 0, part.length);
        return out.toByteArray();
    }
}
