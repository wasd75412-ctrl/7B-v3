package tw.club7b.scoreremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public final class Mp4LargeOffsetRepairTest {
    private static final long FOUR_GB = 0x1_0000_0000L;

    @Test
    public void restoresOffsetsThatWrappedAtFourGigabytes() throws Exception {
        byte[] moov = movie(stco(1000, 5000, 164), stco(80, 90, 100));
        long moovAt = 64 + FOUR_GB + 4096;
        Mem file = movieFile(32, moovAt, moov);
        long before = file.size;

        assertTrue(Mp4LargeOffsetRepair.repair(file));

        assertEquals(24, uint32(file.readAt(24, 4), 0));
        byte[] mdat = file.readAt(48, 16);
        assertEquals(1, uint32(mdat, 0));
        assertEquals("mdat", text(mdat, 4, 4));
        assertEquals(moovAt, 48 + uint64(mdat, 8));
        assertEquals("free", text(file.readAt(moovAt, 8), 4, 4));

        byte[] fixed = file.readAt(before, (int) (file.size - before));
        AudioClockAligner.Box repaired = AudioClockAligner.parse(fixed, 0, fixed.length).get(0);
        byte[] video = table(repaired, 0, "co64");
        byte[] audio = table(repaired, 1, "stco");
        assertEquals(FOUR_GB + 164, uint64(video, 8 + 16));
        assertEquals(1000L, uint64(video, 8));
        assertEquals(100, uint32(audio, 8 + 8));
        assertFalse(Mp4LargeOffsetRepair.repair(file));
        assertEquals(before + fixed.length, file.size);
    }

    @Test
    public void refusesALargeFileWithNoRoomForTheMdatHeader() {
        byte[] moov = movie(stco(1000, 5000, 164), stco(80, 90, 100));
        Mem file = movieFile(8, 40 + FOUR_GB + 100, moov);
        long before = file.size;
        assertThrows(IOException.class, () -> Mp4LargeOffsetRepair.repair(file));
        assertEquals(before, file.size);
    }

    @Test
    public void leavesAShorterRecordingUntouched() throws Exception {
        Mem file = new Mem();
        file.size = 2_000_000;
        assertFalse(Mp4LargeOffsetRepair.repair(file));
        assertEquals(2_000_000, file.size);
    }

    @Test
    public void keepsAnIncreasingOffsetTable() {
        ByteBuffer payload = ByteBuffer.allocate(8 + 8).putInt(0).putInt(2).putInt(10).putInt(20);
        assertEquals(null, Mp4LargeOffsetRepair.widen(payload.array()));
    }

    private static byte[] table(AudioClockAligner.Box moov, int track, String type) {
        return moov.children("trak").get(track).child("mdia").child("minf").child("stbl").child(type).payload;
    }

    /** freeSize is the padding box between a 24-byte ftyp and mdat. Payload starts 8 bytes after mdat. */
    private static Mem movieFile(int freeSize, long moovAt, byte[] moov) {
        int mdatAt = 24 + freeSize;
        long real = moovAt - mdatAt;
        byte[] prefix = concat(box("ftyp", new byte[16]), box("free", new byte[freeSize - 8]),
                box("mdat", new byte[0]));
        byte[] declared = Arrays.copyOf(prefix, mdatAt + 8);
        ByteBuffer.wrap(declared).putInt(mdatAt, (int) real);
        Mem file = new Mem();
        file.write(0, declared);
        file.write(moovAt, moov);
        return file;
    }

    private static byte[] movie(byte[] videoStco, byte[] audioStco) {
        return box("moov", box("mvhd", new byte[100]),
                trak(videoStco), trak(audioStco));
    }

    private static byte[] trak(byte[] stco) {
        return box("trak", box("mdia", box("minf", box("stbl", box("stco", stco)))));
    }

    private static byte[] stco(int... offsets) {
        ByteBuffer buffer = ByteBuffer.allocate(8 + offsets.length * 4).putInt(0).putInt(offsets.length);
        for (int offset : offsets) buffer.putInt(offset);
        return buffer.array();
    }

    private static byte[] box(String type, byte[]... parts) {
        int length = 8;
        for (byte[] part : parts) length += part.length;
        ByteBuffer buffer = ByteBuffer.allocate(length).putInt(length).put(type.getBytes(StandardCharsets.ISO_8859_1));
        for (byte[] part : parts) buffer.put(part);
        return buffer.array();
    }

    private static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) length += part.length;
        byte[] out = new byte[length];
        int cursor = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, out, cursor, part.length);
            cursor += part.length;
        }
        return out;
    }

    private static long uint32(byte[] data, int at) {
        return ((data[at] & 0xFFL) << 24) | ((data[at + 1] & 0xFFL) << 16)
                | ((data[at + 2] & 0xFFL) << 8) | (data[at + 3] & 0xFFL);
    }

    private static long uint64(byte[] data, int at) {
        return (uint32(data, at) << 32) | uint32(data, at + 4);
    }

    private static String text(byte[] data, int at, int length) {
        return new String(data, at, length, StandardCharsets.ISO_8859_1);
    }

    private static final class Mem implements AudioClockAligner.Storage {
        long size;
        final List<Segment> segments = new ArrayList<>();

        @Override public void write(long position, byte[] data) {
            segments.add(new Segment(position, data.clone()));
            size = Math.max(size, position + data.length);
        }

        byte[] readAt(long position, int length) throws IOException {
            byte[] out = new byte[length];
            read(position, out);
            return out;
        }

        @Override public long size() { return size; }

        @Override public void read(long position, byte[] target) {
            Arrays.fill(target, (byte) 0);
            for (Segment segment : segments) {
                long start = Math.max(position, segment.offset);
                long end = Math.min(position + target.length, segment.offset + segment.data.length);
                if (start >= end) continue;
                System.arraycopy(segment.data, (int) (start - segment.offset), target,
                        (int) (start - position), (int) (end - start));
            }
        }

        @Override public void sync() {}

        static final class Segment {
            final long offset;
            final byte[] data;
            Segment(long offset, byte[] data) { this.offset = offset; this.data = data; }
        }
    }
}
