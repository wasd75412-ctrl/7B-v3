package tw.club7b.scoreremote;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * CameraX stamps audio by sample count, so a microphone clock running tens of ppm slow makes the
 * sound drift ahead of the picture as a long recording goes on. Players follow the audio clock,
 * so the video timestamps are rescaled to end with the audio. Only the moov index is rewritten.
 */
final class AudioClockAligner {
    static final double MIN_DURATION_SECONDS = 60;
    static final double MIN_DRIFT_SECONDS = 0.05;
    static final double MAX_DRIFT_RATIO = 0.001;
    private static final List<String> CONTAINERS = Arrays.asList("moov", "trak", "mdia", "minf", "stbl", "edts");

    private AudioClockAligner() {}

    interface Storage {
        long size() throws IOException;
        void read(long position, byte[] target) throws IOException;
        void write(long position, byte[] source) throws IOException;
        void sync() throws IOException;
    }

    /** Aligns a saved MediaStore video in place; any failure leaves the original index untouched. */
    static boolean align(android.content.ContentResolver resolver, android.net.Uri uri) throws IOException {
        try (android.os.ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "rw")) {
            if (descriptor == null) return false;
            return align(descriptorStorage(descriptor.getFileDescriptor()));
        }
    }

    static Storage channelStorage(FileChannel channel) {
        return new Storage() {
            @Override public long size() throws IOException { return channel.size(); }
            @Override public void read(long position, byte[] target) throws IOException {
                ByteBuffer buffer = ByteBuffer.wrap(target);
                while (buffer.hasRemaining()) {
                    if (channel.read(buffer, position + buffer.position()) < 0) throw new IOException("Unexpected end of file");
                }
            }
            @Override public void write(long position, byte[] source) throws IOException {
                ByteBuffer buffer = ByteBuffer.wrap(source);
                while (buffer.hasRemaining()) channel.write(buffer, position + buffer.position());
            }
            @Override public void sync() throws IOException { channel.force(true); }
        };
    }

    /** Channels from content descriptors are one-directional, so the descriptor is driven directly. */
    private static Storage descriptorStorage(java.io.FileDescriptor fd) {
        return new Storage() {
            @Override public long size() throws IOException {
                try { return android.system.Os.fstat(fd).st_size; }
                catch (android.system.ErrnoException error) { throw new IOException(error); }
            }
            @Override public void read(long position, byte[] target) throws IOException {
                try {
                    int done = 0;
                    while (done < target.length) {
                        int count = android.system.Os.pread(fd, target, done, target.length - done, position + done);
                        if (count <= 0) throw new IOException("Unexpected end of file");
                        done += count;
                    }
                } catch (android.system.ErrnoException error) { throw new IOException(error); }
            }
            @Override public void write(long position, byte[] source) throws IOException {
                try {
                    int done = 0;
                    while (done < source.length) done += android.system.Os.pwrite(fd, source, done, source.length - done, position + done);
                } catch (android.system.ErrnoException error) { throw new IOException(error); }
            }
            @Override public void sync() throws IOException {
                try { android.system.Os.fsync(fd); }
                catch (android.system.ErrnoException error) { throw new IOException(error); }
            }
        };
    }

    /**
     * Returns true when the video track was rescaled. The new index is appended before the old one
     * is renamed to free, so an interruption still leaves a playable file.
     */
    static boolean align(Storage storage) throws IOException {
        long fileSize = storage.size();
        long moovOffset = -1, moovSize = 0, offset = 0;
        byte[] header = new byte[16];
        while (offset + 8 <= fileSize) {
            byte[] head = offset + 16 <= fileSize ? header : new byte[8];
            storage.read(offset, head);
            ByteBuffer buffer = ByteBuffer.wrap(head);
            long size = buffer.getInt(0) & 0xFFFFFFFFL;
            String type = type(buffer, 4);
            if (size == 1 && head.length == 16) size = buffer.getLong(8);
            else if (size == 0) size = fileSize - offset;
            if (size < 8) return false;
            if ("moov".equals(type) && moovOffset < 0) { moovOffset = offset; moovSize = size; }
            offset += size;
        }
        if (moovOffset < 0 || moovSize > Integer.MAX_VALUE) return false;
        byte[] moovBytes = new byte[(int) moovSize];
        storage.read(moovOffset, moovBytes);
        Box moov = parse(moovBytes, 0, moovBytes.length).get(0);
        if (!rescaleVideo(moov)) return false;

        storage.write(fileSize, serialize(moov));
        storage.sync();
        storage.write(moovOffset + 4, new byte[] {'f', 'r', 'e', 'e'});
        storage.sync();
        return true;
    }

    static boolean rescaleVideo(Box moov) {
        Box mvhd = moov.child("mvhd");
        if (mvhd == null) return false;
        long movieTimescale = timescale(mvhd.payload);
        Track video = null, audio = null;
        for (Box trak : moov.children("trak")) {
            Track track = Track.of(trak);
            if (track == null) continue;
            if ("vide".equals(track.handler)) { if (video != null) return false; video = track; }
            if ("soun".equals(track.handler)) { if (audio != null) return false; audio = track; }
        }
        if (video == null || audio == null || movieTimescale <= 0) return false;
        if (video.trak.child("edts") != null) return false;

        double videoSeconds = video.sampleTicks() / (double) video.timescale;
        double audioEnd = audio.emptyEditTicks(movieTimescale) / (double) movieTimescale
                + audio.sampleTicks() / (double) audio.timescale;
        double drift = Math.abs(videoSeconds - audioEnd);
        if (videoSeconds < MIN_DURATION_SECONDS || drift < MIN_DRIFT_SECONDS) return false;
        if (drift / videoSeconds > MAX_DRIFT_RATIO) return false;

        long newTicks = video.rewriteStts(audioEnd / videoSeconds);
        if (newTicks > 0xFFFFFFFFL && video.mdhd.payload[0] == 0) return false;
        setDuration(video.mdhd.payload, 16, 24, newTicks);
        long videoMovieDuration = Math.round(newTicks * (double) movieTimescale / video.timescale);
        setDuration(video.tkhd.payload, 20, 28, videoMovieDuration);
        long movieDuration = videoMovieDuration;
        for (Box trak : moov.children("trak")) {
            Box tkhd = trak.child("tkhd");
            if (tkhd != null) movieDuration = Math.max(movieDuration, duration(tkhd.payload, 20, 28));
        }
        setDuration(mvhd.payload, 16, 24, movieDuration);
        return true;
    }

    private static final class Track {
        final Box trak, tkhd, mdhd, stts;
        final String handler;
        final long timescale;

        private Track(Box trak, Box tkhd, Box mdhd, Box stts, String handler) {
            this.trak = trak; this.tkhd = tkhd; this.mdhd = mdhd; this.stts = stts; this.handler = handler;
            this.timescale = timescale(mdhd.payload);
        }

        static Track of(Box trak) {
            Box tkhd = trak.child("tkhd"), mdia = trak.child("mdia");
            if (tkhd == null || mdia == null) return null;
            Box mdhd = mdia.child("mdhd"), hdlr = mdia.child("hdlr"), minf = mdia.child("minf");
            Box stbl = minf == null ? null : minf.child("stbl");
            Box stts = stbl == null ? null : stbl.child("stts");
            if (mdhd == null || hdlr == null || stts == null || hdlr.payload.length < 12) return null;
            Track track = new Track(trak, tkhd, mdhd, stts, new String(hdlr.payload, 8, 4, java.nio.charset.StandardCharsets.ISO_8859_1));
            return track.timescale > 0 ? track : null;
        }

        long sampleTicks() {
            ByteBuffer buffer = ByteBuffer.wrap(stts.payload);
            int count = buffer.getInt(4);
            long total = 0;
            for (int index = 0; index < count; index++) {
                total += (buffer.getInt(8 + index * 8) & 0xFFFFFFFFL) * (buffer.getInt(12 + index * 8) & 0xFFFFFFFFL);
            }
            return total;
        }

        long emptyEditTicks(long movieTimescale) {
            Box edts = trak.child("edts");
            Box elst = edts == null ? null : edts.child("elst");
            if (elst == null) return 0;
            ByteBuffer buffer = ByteBuffer.wrap(elst.payload);
            boolean wide = elst.payload[0] == 1;
            int count = buffer.getInt(4), entry = wide ? 20 : 12;
            long empty = 0;
            for (int index = 0; index < count; index++) {
                int at = 8 + index * entry;
                long duration = wide ? buffer.getLong(at) : buffer.getInt(at) & 0xFFFFFFFFL;
                long mediaTime = wide ? buffer.getLong(at + 8) : buffer.getInt(at + 4);
                if (mediaTime != -1) break;
                empty += duration;
            }
            return empty;
        }

        /** Rounds each scaled decode time so the error never accumulates past half a tick. */
        long rewriteStts(double scale) {
            ByteBuffer buffer = ByteBuffer.wrap(stts.payload);
            int count = buffer.getInt(4);
            List<long[]> runs = new ArrayList<>();
            long oldTime = 0, newTime = 0;
            for (int index = 0; index < count; index++) {
                long samples = buffer.getInt(8 + index * 8) & 0xFFFFFFFFL;
                long delta = buffer.getInt(12 + index * 8) & 0xFFFFFFFFL;
                for (long sample = 0; sample < samples; sample++) {
                    oldTime += delta;
                    long scaled = Math.round(oldTime * scale);
                    long newDelta = scaled - newTime;
                    newTime = scaled;
                    long[] last = runs.isEmpty() ? null : runs.get(runs.size() - 1);
                    if (last != null && last[1] == newDelta) last[0]++;
                    else runs.add(new long[] {1, newDelta});
                }
            }
            ByteBuffer out = ByteBuffer.allocate(8 + runs.size() * 8);
            out.putInt(buffer.getInt(0)).putInt(runs.size());
            for (long[] run : runs) out.putInt((int) run[0]).putInt((int) run[1]);
            stts.payload = out.array();
            return newTime;
        }
    }

    static final class Box {
        final String type;
        byte[] payload;
        List<Box> children;

        Box(String type) { this.type = type; }

        Box child(String childType) {
            if (children == null) return null;
            for (Box box : children) if (box.type.equals(childType)) return box;
            return null;
        }

        List<Box> children(String childType) {
            List<Box> matches = new ArrayList<>();
            if (children != null) for (Box box : children) if (box.type.equals(childType)) matches.add(box);
            return matches;
        }
    }

    static List<Box> parse(byte[] bytes, int start, int end) {
        List<Box> boxes = new ArrayList<>();
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        int position = start;
        while (position + 8 <= end) {
            long size = buffer.getInt(position) & 0xFFFFFFFFL;
            String type = type(buffer, position + 4);
            int header = 8;
            if (size == 1) { size = buffer.getLong(position + 8); header = 16; }
            else if (size == 0) size = end - position;
            if (size < header || position + size > end) throw new IllegalArgumentException("Bad box " + type);
            Box box = new Box(type);
            int bodyStart = position + header, bodyEnd = (int) (position + size);
            if (CONTAINERS.contains(type)) box.children = parse(bytes, bodyStart, bodyEnd);
            else box.payload = Arrays.copyOfRange(bytes, bodyStart, bodyEnd);
            boxes.add(box);
            position = bodyEnd;
        }
        return boxes;
    }

    static byte[] serialize(Box box) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        if (box.children != null) {
            for (Box child : box.children) {
                byte[] bytes = serialize(child);
                body.write(bytes, 0, bytes.length);
            }
        } else {
            body.write(box.payload, 0, box.payload.length);
        }
        byte[] content = body.toByteArray();
        ByteBuffer out = ByteBuffer.allocate(8 + content.length);
        out.putInt(8 + content.length);
        out.put(box.type.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1));
        out.put(content);
        return out.array();
    }

    /** mvhd and mdhd share the timescale position for each full-box version. */
    private static long timescale(byte[] payload) {
        ByteBuffer buffer = ByteBuffer.wrap(payload);
        return buffer.getInt(payload[0] == 1 ? 20 : 12) & 0xFFFFFFFFL;
    }

    private static long duration(byte[] payload, int v0Offset, int v1Offset) {
        ByteBuffer buffer = ByteBuffer.wrap(payload);
        return payload[0] == 1 ? buffer.getLong(v1Offset) : buffer.getInt(v0Offset) & 0xFFFFFFFFL;
    }

    private static void setDuration(byte[] payload, int v0Offset, int v1Offset, long value) {
        ByteBuffer buffer = ByteBuffer.wrap(payload);
        if (payload[0] == 1) buffer.putLong(v1Offset, value);
        else buffer.putInt(v0Offset, (int) value);
    }

    private static String type(ByteBuffer buffer, int at) {
        byte[] bytes = new byte[4];
        for (int index = 0; index < 4; index++) bytes[index] = buffer.get(at + index);
        return new String(bytes, java.nio.charset.StandardCharsets.ISO_8859_1);
    }
}
