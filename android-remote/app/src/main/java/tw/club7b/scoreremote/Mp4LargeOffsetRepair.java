package tw.club7b.scoreremote;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Log;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Android 9's MediaMuxer records chunk offsets and the mdat size in 32 bits. A broadcast past 4 GB
 * is complete on disk, but players stop at the truncated mdat and never reach the index, so the
 * file will not play and YouTube rejects it. The index is rewritten with 64-bit offsets and the
 * mdat header grows into the preceding free box, leaving every sample byte where it is.
 */
final class Mp4LargeOffsetRepair {
    private static final String TAG = "7BRecording";
    private static final long FOUR_GB = 0x1_0000_0000L;
    private static final int TAIL_WINDOW = 64 * 1024 * 1024;
    private static final int PRECEDING_WINDOW = 16 * 1024 * 1024;

    private Mp4LargeOffsetRepair() {}

    static boolean repair(ContentResolver resolver, Uri uri) throws IOException {
        try (ParcelFileDescriptor descriptor = resolver.openFileDescriptor(uri, "rw")) {
            if (descriptor == null) throw new java.io.FileNotFoundException(String.valueOf(uri));
            boolean changed = repair(AudioClockAligner.descriptorStorage(descriptor.getFileDescriptor()));
            long size = descriptor.getStatSize();
            if (changed || size > 0xFFFFFFFFL) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Video.Media.SIZE, size);
                resolver.update(uri, values, null, null);
            }
            return changed;
        }
    }

    static boolean repair(AudioClockAligner.Storage storage) throws IOException {
        long fileSize = storage.size();
        if (fileSize <= 0xFFFFFFFFL) return false;
        Atom mdat = null;
        Atom previous = null;
        long cursor = 0;
        while (cursor + 8 <= fileSize && cursor < TAIL_WINDOW) {
            Atom atom = readAtom(storage, cursor, fileSize);
            if (atom == null) return false;
            if ("mdat".equals(atom.type)) { mdat = atom; break; }
            previous = atom;
            cursor = atom.end();
        }
        if (mdat == null) return false;
        if (mdat.header == 16 && mdat.size >= 16 && finishedIndex(storage, mdat.offset + mdat.size)) return false;

        Atom tail = findTailMoov(storage, fileSize);
        if (tail == null) return false;
        AudioClockAligner.Box tailMoov = readMoov(storage, tail);
        if (tailMoov == null) return false;
        boolean rebuild = rebuildOffsets(tailMoov);
        Atom preceding = rebuild ? null : boxEndingAt(storage, tail.offset);
        long mediaEnd = preceding == null ? tail.offset : preceding.offset;
        boolean truncated = truncatedMdat(mdat, mediaEnd);
        if (!rebuild && !truncated) return false;
        if (truncated && !canExtendMdat(previous, mdat, mediaEnd)) {
            throw new IOException("Recording exceeds 4 GB and its index cannot be repaired");
        }

        if (rebuild) {
            storage.write(fileSize, AudioClockAligner.serialize(tailMoov));
            storage.sync();
            storage.write(tail.offset + 4, new byte[] {'f', 'r', 'e', 'e'});
            storage.sync();
        } else if (preceding != null && "moov".equals(preceding.type)) {
            AudioClockAligner.Box older = readMoov(storage, preceding);
            if (older != null && rebuildOffsets(older)) {
                storage.write(preceding.offset + 4, new byte[] {'f', 'r', 'e', 'e'});
                storage.sync();
            }
        }
        if (truncated) writeMdat(storage, previous, mdat, mediaEnd);
        storage.sync();
        Log.i(TAG, "Repaired recording offsets past 4 GB");
        return true;
    }

    /** True when a 32-bit mdat size is the low half of the distance to the real index. */
    private static boolean truncatedMdat(Atom mdat, long mediaEnd) {
        long real = mediaEnd - mdat.offset;
        return mdat.header == 8 && real > 0xFFFFFFFFL && (real & 0xFFFFFFFFL) == mdat.size;
    }

    private static boolean canExtendMdat(Atom previous, Atom mdat, long mediaEnd) {
        long headerAt = mdat.offset - 8;
        return previous != null
                && previous.end() == mdat.offset
                && isPadding(previous.type)
                && headerAt >= previous.offset + 8
                && headerAt - previous.offset <= Integer.MAX_VALUE;
    }

    private static void writeMdat(AudioClockAligner.Storage storage, Atom previous, Atom mdat, long mediaEnd)
            throws IOException {
        long headerAt = mdat.offset - 8;
        storage.write(previous.offset, ByteBuffer.allocate(4).putInt((int) (headerAt - previous.offset)).array());
        ByteBuffer header = ByteBuffer.allocate(16);
        header.putInt(1);
        header.put(new byte[] {'m', 'd', 'a', 't'});
        header.putLong(mediaEnd - headerAt);
        storage.write(headerAt, header.array());
    }

    /** @return true when any stco table wrapped and was replaced with co64 */
    private static boolean rebuildOffsets(AudioClockAligner.Box box) {
        if (box.children == null) return false;
        boolean changed = false;
        for (int index = 0; index < box.children.size(); index++) {
            AudioClockAligner.Box child = box.children.get(index);
            if ("stco".equals(child.type)) {
                byte[] widened = widen(child.payload);
                if (widened == null) continue;
                AudioClockAligner.Box co64 = new AudioClockAligner.Box("co64");
                co64.payload = widened;
                box.children.set(index, co64);
                changed = true;
            } else {
                changed |= rebuildOffsets(child);
            }
        }
        return changed;
    }

    /** @return co64 payload, or null when every stored offset already increases */
    static byte[] widen(byte[] payload) {
        if (payload == null || payload.length < 8) return null;
        ByteBuffer input = ByteBuffer.wrap(payload);
        int count = input.getInt(4);
        if (count < 0 || 8L + count * 4L > payload.length) return null;
        long base = 0;
        long previous = -1;
        boolean wrapped = false;
        long[] offsets = new long[count];
        for (int index = 0; index < count; index++) {
            long value = input.getInt(8 + index * 4) & 0xFFFFFFFFL;
            if (previous >= 0 && value < previous) {
                base += FOUR_GB;
                wrapped = true;
            }
            offsets[index] = base + value;
            previous = value;
        }
        if (!wrapped) return null;
        ByteBuffer output = ByteBuffer.allocate(8 + count * 8);
        output.putInt(input.getInt(0)).putInt(count);
        for (long value : offsets) output.putLong(value);
        return output.array();
    }

    /** A 64-bit mdat already ends on an index that does not need another rewrite. */
    private static boolean finishedIndex(AudioClockAligner.Storage storage, long offset) throws IOException {
        long fileSize = storage.size();
        if (offset < 0 || offset + 8 > fileSize) return false;
        Atom atom = readAtom(storage, offset, fileSize);
        if (atom == null) return false;
        if ("free".equals(atom.type)) return true;
        if (!"moov".equals(atom.type)) return false;
        AudioClockAligner.Box moov = readMoov(storage, atom);
        return moov != null && !containsWrappingStco(moov);
    }

    private static boolean containsWrappingStco(AudioClockAligner.Box box) {
        if (box.children == null) return "stco".equals(box.type) && widen(box.payload) != null;
        for (AudioClockAligner.Box child : box.children) {
            if (containsWrappingStco(child)) return true;
        }
        return false;
    }

    private static Atom findTailMoov(AudioClockAligner.Storage storage, long fileSize) throws IOException {
        long window = Math.min(fileSize, TAIL_WINDOW);
        byte[] tail = new byte[(int) window];
        long base = fileSize - window;
        storage.read(base, tail);
        for (int index = 0; index + 8 <= tail.length; index++) {
            if (!fourcc(tail, index + 4, "moov")) continue;
            Atom atom = atomFrom(tail, index, tail.length - index, base + index, fileSize);
            if (atom == null || atom.end() != fileSize || readMoov(storage, atom) == null) continue;
            return atom;
        }
        return null;
    }

    /** A moov or free box that ends exactly at {@code end}, when a repaired index was appended after it. */
    private static Atom boxEndingAt(AudioClockAligner.Storage storage, long end) throws IOException {
        if (end < 8) return null;
        long window = Math.min(end, PRECEDING_WINDOW);
        byte[] data = new byte[(int) window];
        long base = end - window;
        storage.read(base, data);
        for (int index = 0; index + 8 <= data.length; index++) {
            if (!fourcc(data, index + 4, "moov") && !fourcc(data, index + 4, "free")) continue;
            Atom atom = atomFrom(data, index, data.length - index, base + index, end);
            if (atom != null && atom.end() == end) return atom;
        }
        return null;
    }

    private static AudioClockAligner.Box readMoov(AudioClockAligner.Storage storage, Atom atom) throws IOException {
        if (!"moov".equals(atom.type) || atom.size > TAIL_WINDOW) return null;
        byte[] bytes = new byte[(int) atom.size];
        storage.read(atom.offset, bytes);
        try {
            List<AudioClockAligner.Box> boxes = AudioClockAligner.parse(bytes, 0, bytes.length);
            if (boxes.isEmpty() || !"moov".equals(boxes.get(0).type) || boxes.get(0).child("mvhd") == null) return null;
            return boxes.get(0);
        } catch (RuntimeException invalid) {
            return null;
        }
    }

    private static Atom readAtom(AudioClockAligner.Storage storage, long offset, long limit) throws IOException {
        if (offset < 0 || offset + 8 > limit) return null;
        byte[] header = new byte[(int) Math.min(16, limit - offset)];
        storage.read(offset, header);
        return atomFrom(header, 0, header.length, offset, limit);
    }

    private static Atom atomFrom(byte[] data, int at, int available, long offset, long limit) {
        if (available < 8 || at < 0 || at + 8 > data.length) return null;
        long size = uint32(data, at);
        int header = 8;
        if (size == 1) {
            if (available < 16 || at + 16 > data.length) return null;
            size = uint64(data, at + 8);
            header = 16;
        } else if (size == 0) {
            size = limit - offset;
        }
        if (size < header) return null;
        byte[] type = new byte[4];
        System.arraycopy(data, at + 4, type, 0, 4);
        return new Atom(offset, size, new String(type, StandardCharsets.ISO_8859_1), header);
    }

    private static boolean fourcc(byte[] data, int at, String type) {
        if (at < 0 || at + 4 > data.length) return false;
        return data[at] == type.charAt(0) && data[at + 1] == type.charAt(1)
                && data[at + 2] == type.charAt(2) && data[at + 3] == type.charAt(3);
    }

    private static long uint32(byte[] data, int at) {
        return ((data[at] & 0xFFL) << 24) | ((data[at + 1] & 0xFFL) << 16)
                | ((data[at + 2] & 0xFFL) << 8) | (data[at + 3] & 0xFFL);
    }

    private static long uint64(byte[] data, int at) {
        return (uint32(data, at) << 32) | uint32(data, at + 4);
    }

    private static boolean isPadding(String type) {
        return "free".equals(type) || "skip".equals(type) || "wide".equals(type);
    }

    private static final class Atom {
        final long offset;
        final long size;
        final String type;
        final int header;

        Atom(long offset, long size, String type, int header) {
            this.offset = offset;
            this.size = size;
            this.type = type;
            this.header = header;
        }

        long end() { return offset + size; }
    }
}
