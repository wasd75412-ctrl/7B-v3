package tw.club7b.scoreremote;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.provider.MediaStore;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;
import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * Rewrites a saved broadcast so AirPods receive the court microphone in both ears. The video track
 * is copied. Only the audio is encoded again, and only when one ear would otherwise be silent.
 */
final class RecordingAudioBalance {
    private static final String TAG = "7BRecording";
    private static final int TIMEOUT_US = 10_000;
    private static final int STALL_LIMIT = 1_000;
    private static final long RESERVE_BYTES = 64L * 1024 * 1024;

    private RecordingAudioBalance() {}

    /** {@code ready} is false when a later upload should try the rewrite again. */
    static final class Outcome {
        final Uri uri;
        final boolean ready;
        final String displayName;

        Outcome(Uri uri, boolean ready) { this(uri, ready, null); }

        Outcome(Uri uri, boolean ready, String displayName) {
            this.uri = uri;
            this.ready = ready;
            this.displayName = displayName;
        }
    }

    static Outcome balance(Context context, Uri source) {
        try {
            return rewriteIfOneSided(context, source);
        } catch (Exception error) {
            Log.w(TAG, "Unable to balance recording audio", error);
            ErrorLog.record(context, "recording", "耳機左右聲道校正失敗", error);
            return new Outcome(source, false);
        }
    }

    private static Outcome rewriteIfOneSided(Context context, Uri source) throws IOException {
        if (!hasRoom(context, source)) {
            Log.w(TAG, "Skipped audio balance because free space is low");
            return new Outcome(source, false);
        }
        Mix mix = inspect(context, source);
        if (mix == null) return new Outcome(source, true);
        Sibling sibling = insertSibling(context.getContentResolver(), source);
        if (sibling == null) return new Outcome(source, false);
        boolean published = false;
        try {
            long size = transcode(context.getContentResolver(), source, sibling.uri, mix);
            publish(context.getContentResolver(), sibling, size);
            published = true;
            Log.i(TAG, "Copied the court microphone into both audio channels");
            return new Outcome(sibling.uri, true, sibling.name);
        } finally {
            if (!published) deleteQuietly(context.getContentResolver(), sibling.uri);
        }
    }

    private enum Mix { UPMIX, LEFT, RIGHT }

    private static Mix inspect(Context context, Uri source) throws IOException {
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(source, "r")) {
            if (descriptor == null) return null;
            MediaExtractor extractor = new MediaExtractor();
            try {
                rewind(descriptor);
                extractor.setDataSource(descriptor.getFileDescriptor());
                int audio = findAudio(extractor);
                if (audio < 0) return null;
                MediaFormat format = extractor.getTrackFormat(audio);
                int channels = integer(format, MediaFormat.KEY_CHANNEL_COUNT);
                if (integer(format, MediaFormat.KEY_SAMPLE_RATE) <= 0) return null;
                if (channels == 1) return Mix.UPMIX;
                if (channels != 2) return null;
                extractor.selectTrack(audio);
                int dominant = measure(extractor, format);
                if (dominant == RecordingAudioChannels.LEFT) return Mix.LEFT;
                if (dominant == RecordingAudioChannels.RIGHT) return Mix.RIGHT;
                Log.i(TAG, "Recording audio already plays in both ears");
                return null;
            } finally {
                extractor.release();
            }
        }
    }

    private static int measure(MediaExtractor extractor, MediaFormat format) throws IOException {
        MediaCodec decoder = MediaCodec.createDecoderByType(mime(format));
        decoder.configure(format, null, null, 0);
        decoder.start();
        long[] energy = new long[2];
        boolean inputEnded = false, outputEnded = false;
        int stalls = 0, channels = 2;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (!outputEnded) {
                boolean progress = false;
                if (!inputEnded) {
                    int in = decoder.dequeueInputBuffer(TIMEOUT_US);
                    if (in >= 0) {
                        ByteBuffer buffer = decoder.getInputBuffer(in);
                        if (buffer == null) throw new IOException("Audio decoder input is missing");
                        buffer.clear();
                        int size = extractor.readSampleData(buffer, 0);
                            if (size < 0) {
                                decoder.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                inputEnded = true;
                            } else {
                                decoder.queueInputBuffer(in, 0, size, Math.max(0, extractor.getSampleTime()), 0);
                                extractor.advance();
                            }
                        progress = true;
                    }
                }
                int out = decoder.dequeueOutputBuffer(info, TIMEOUT_US);
                if (out == MediaCodec.INFO_TRY_AGAIN_LATER) {
                    if (!progress && ++stalls > STALL_LIMIT) throw new IOException("Audio measurement stalled");
                    continue;
                }
                stalls = 0;
                if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat decoded = decoder.getOutputFormat();
                    channels = integer(decoded, MediaFormat.KEY_CHANNEL_COUNT);
                    requirePcm16(decoded);
                    if (channels != 2) return RecordingAudioChannels.BOTH;
                    continue;
                }
                if (out < 0) continue;
                ByteBuffer data = decoder.getOutputBuffer(out);
                if (info.size > 0 && data != null && channels == 2) {
                    byte[] pcm = new byte[info.size];
                    data.position(info.offset);
                    data.limit(info.offset + info.size);
                    data.get(pcm);
                    RecordingAudioChannels.addEnergy(energy, pcm, 0, pcm.length, 2);
                }
                decoder.releaseOutputBuffer(out, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputEnded = true;
            }
        } finally {
            release(decoder);
        }
        return RecordingAudioChannels.dominantChannel(energy[0], energy[1]);
    }

    private static long transcode(ContentResolver resolver, Uri source, Uri destination, Mix mix) throws IOException {
        ParcelFileDescriptor videoFd = null, audioFd = null, outputFd = null;
        MediaExtractor video = null, audio = null;
        MediaCodec decoder = null, encoder = null;
        MediaMuxer muxer = null;
        try {
            videoFd = resolver.openFileDescriptor(source, "r");
            audioFd = resolver.openFileDescriptor(source, "r");
            outputFd = resolver.openFileDescriptor(destination, "rw");
            if (videoFd == null || audioFd == null || outputFd == null) throw new IOException("Unable to open recording");
            rewind(videoFd);
            rewind(audioFd);
            Os.ftruncate(outputFd.getFileDescriptor(), 0);
            video = new MediaExtractor();
            audio = new MediaExtractor();
            video.setDataSource(videoFd.getFileDescriptor());
            audio.setDataSource(audioFd.getFileDescriptor());
            int audioTrack = findAudio(audio);
            if (audioTrack < 0) throw new IOException("Recording audio track is missing");
            MediaFormat audioFormat = audio.getTrackFormat(audioTrack);
            audio.selectTrack(audioTrack);
            muxer = new MediaMuxer(outputFd.getFileDescriptor(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int videoCount = countVideoTracks(video, muxer);
            decoder = MediaCodec.createDecoderByType(mime(audioFormat));
            decoder.configure(audioFormat, null, null, 0);
            decoder.start();
            int sampleRate = integer(audioFormat, MediaFormat.KEY_SAMPLE_RATE);
            encoder = createEncoder(sampleRate, bitrate(audioFormat));
            Writer writer = new Writer(video, audio, decoder, encoder, muxer, mix, sampleRate, videoCount);
            writer.run();
            muxer.stop();
            MediaMuxer stopped = muxer;
            muxer = null;
            stopped.release();
            Os.fsync(outputFd.getFileDescriptor());
            Mp4LargeOffsetRepair.repair(AudioClockAligner.descriptorStorage(outputFd.getFileDescriptor()));
            long size = outputFd.getStatSize();
            if (size <= 0) size = Os.fstat(outputFd.getFileDescriptor()).st_size;
            if (size < 1024) throw new IOException("Balanced recording is empty");
            return size;
        } catch (ErrnoException error) {
            throw new IOException(error);
        } finally {
            release(decoder);
            release(encoder);
            if (video != null) video.release();
            if (audio != null) audio.release();
            if (muxer != null) muxer.release();
            close(videoFd);
            close(audioFd);
            close(outputFd);
        }
    }

    private static int countVideoTracks(MediaExtractor video, MediaMuxer muxer) throws IOException {
        int count = 0;
        for (int index = 0; index < video.getTrackCount(); index++) {
            MediaFormat format = video.getTrackFormat(index);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime == null || !mime.startsWith("video/")) continue;
            if (count == 0 && format.containsKey(MediaFormat.KEY_ROTATION)) {
                muxer.setOrientationHint(format.getInteger(MediaFormat.KEY_ROTATION));
            }
            count++;
        }
        if (count == 0) throw new IOException("Recording has no video track");
        return count;
    }

    private static final class Writer {
        final MediaExtractor video;
        final MediaExtractor audio;
        final MediaCodec decoder;
        final MediaCodec encoder;
        final MediaMuxer muxer;
        final Mix mix;
        final int sampleRate;
        final int[] videoExtractorTracks;
        final int[] videoMuxerTracks;
        final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        byte[] pending = new byte[64 * 1024];
        byte[] carry = new byte[4];
        int pendingSize, carrySize, decodedChannels;
        long originUs = Long.MIN_VALUE, framesQueued;
        boolean decoderInputEnded, decoderOutputEnded, encoderInputEnded, muxerStarted;
        int muxerAudio = -1;

        Writer(MediaExtractor video, MediaExtractor audio, MediaCodec decoder, MediaCodec encoder,
                MediaMuxer muxer, Mix mix, int sampleRate, int videoCount) {
            this.video = video;
            this.audio = audio;
            this.decoder = decoder;
            this.encoder = encoder;
            this.muxer = muxer;
            this.mix = mix;
            this.sampleRate = sampleRate;
            videoExtractorTracks = new int[videoCount];
            videoMuxerTracks = new int[videoCount];
            int cursor = 0;
            for (int index = 0; index < video.getTrackCount(); index++) {
                MediaFormat format = video.getTrackFormat(index);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null || !mime.startsWith("video/")) continue;
                videoExtractorTracks[cursor] = index;
                videoMuxerTracks[cursor] = muxer.addTrack(format);
                cursor++;
            }
            if (cursor != videoCount) throw new IllegalStateException("Video track count changed");
        }

        void run() throws IOException {
            int stalls = 0;
            while (!encoderDone()) {
                boolean progress = false;
                progress |= drainEncoder();
                progress |= feedEncoder();
                if (pendingSize < 256 * 1024) progress |= drainDecoder();
                if (!decoderInputEnded) progress |= feedDecoder();
                if (progress) stalls = 0;
                else if (++stalls > STALL_LIMIT) throw new IOException("Audio balance stalled");
            }
            if (!muxerStarted) throw new IOException("Audio encoder produced no output");
            copyVideo();
        }

        private boolean encoderDone() {
            return encoderInputEnded && lastEncoderEos;
        }

        private boolean lastEncoderEos;

        private boolean feedDecoder() throws IOException {
            int in = decoder.dequeueInputBuffer(TIMEOUT_US);
            if (in < 0) return false;
            ByteBuffer buffer = decoder.getInputBuffer(in);
            if (buffer == null) throw new IOException("Audio decoder input is missing");
            buffer.clear();
            int size = audio.readSampleData(buffer, 0);
            if (size < 0) {
                decoder.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                decoderInputEnded = true;
                return true;
            }
            long time = Math.max(0, audio.getSampleTime());
            decoder.queueInputBuffer(in, 0, size, time, 0);
            audio.advance();
            return true;
        }

        private boolean drainDecoder() throws IOException {
            if (decoderOutputEnded) return false;
            int out = decoder.dequeueOutputBuffer(info, TIMEOUT_US);
            if (out == MediaCodec.INFO_TRY_AGAIN_LATER || out == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) return false;
            if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat decoded = decoder.getOutputFormat();
                decodedChannels = integer(decoded, MediaFormat.KEY_CHANNEL_COUNT);
                requirePcm16(decoded);
                int decodedRate = integer(decoded, MediaFormat.KEY_SAMPLE_RATE);
                if (decodedRate != 0 && decodedRate != sampleRate) throw new IOException("Audio sample rate changed");
                if (mix == Mix.UPMIX && decodedChannels != 1) throw new IOException("Expected mono audio");
                if (mix != Mix.UPMIX && decodedChannels != 2) throw new IOException("Expected stereo audio");
                return true;
            }
            if (out < 0) return false;
            ByteBuffer data = decoder.getOutputBuffer(out);
            if (info.size > 0 && data != null) {
                if (originUs == Long.MIN_VALUE) originUs = Math.max(0, info.presentationTimeUs);
                byte[] pcm = new byte[info.size];
                data.position(info.offset);
                data.limit(info.offset + info.size);
                data.get(pcm);
                accept(pcm);
            }
            boolean ended = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
            decoder.releaseOutputBuffer(out, false);
            if (ended) decoderOutputEnded = true;
            return true;
        }

        private void accept(byte[] pcm) {
            int frame = mix == Mix.UPMIX ? 2 : 4;
            byte[] joined = new byte[carrySize + pcm.length];
            System.arraycopy(carry, 0, joined, 0, carrySize);
            System.arraycopy(pcm, 0, joined, carrySize, pcm.length);
            int usable = joined.length - (joined.length % frame);
            carrySize = joined.length - usable;
            System.arraycopy(joined, usable, carry, 0, carrySize);
            if (usable == 0) return;
            byte[] stereo = new byte[mix == Mix.UPMIX ? usable * 2 : usable];
            int written = mix == Mix.UPMIX
                    ? RecordingAudioChannels.upmixMono(joined, usable, stereo)
                    : RecordingAudioChannels.duplicateChannel(joined, usable,
                    mix == Mix.LEFT ? RecordingAudioChannels.LEFT : RecordingAudioChannels.RIGHT, stereo);
            appendPending(stereo, written);
        }

        private void appendPending(byte[] data, int length) {
            if (pendingSize + length > pending.length) {
                byte[] grown = new byte[Math.max(pending.length * 2, pendingSize + length)];
                System.arraycopy(pending, 0, grown, 0, pendingSize);
                pending = grown;
            }
            System.arraycopy(data, 0, pending, pendingSize, length);
            pendingSize += length;
        }

        private boolean feedEncoder() throws IOException {
            if (encoderInputEnded) return false;
            boolean finishing = decoderOutputEnded && pendingSize < 4;
            if (pendingSize < 4 && !finishing) return false;
            int in = encoder.dequeueInputBuffer(TIMEOUT_US);
            if (in < 0) return false;
            ByteBuffer buffer = encoder.getInputBuffer(in);
            if (buffer == null) return false;
            if (buffer.capacity() < 4) throw new IOException("Audio encoder buffer is too small");
            buffer.clear();
            int bytes = finishing ? 0 : Math.min(pendingSize, buffer.capacity());
            bytes -= bytes % 4;
            if (bytes > 0) {
                buffer.put(pending, 0, bytes);
                System.arraycopy(pending, bytes, pending, 0, pendingSize - bytes);
                pendingSize -= bytes;
                framesQueued += bytes / 4L;
            }
            int flags = 0;
            if (decoderOutputEnded && pendingSize < 4) {
                flags = MediaCodec.BUFFER_FLAG_END_OF_STREAM;
                encoderInputEnded = true;
            }
            long pts = (originUs == Long.MIN_VALUE ? 0 : originUs) + framesBefore(bytes) * 1_000_000L / sampleRate;
            encoder.queueInputBuffer(in, 0, bytes, Math.max(0, pts), flags);
            return true;
        }

        private long framesBefore(int bytes) {
            return framesQueued - (bytes / 4L);
        }

        private boolean drainEncoder() throws IOException {
            int out = encoder.dequeueOutputBuffer(info, TIMEOUT_US);
            if (out == MediaCodec.INFO_TRY_AGAIN_LATER || out == MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED) return false;
            if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (muxerStarted) throw new IOException("Audio format changed twice");
                muxerAudio = muxer.addTrack(encoder.getOutputFormat());
                muxer.start();
                muxerStarted = true;
                return true;
            }
            if (out < 0) return false;
            ByteBuffer data = encoder.getOutputBuffer(out);
            boolean ended = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
            if (muxerStarted && data != null && info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                data.position(info.offset);
                data.limit(info.offset + info.size);
                muxer.writeSampleData(muxerAudio, data, info);
            }
            encoder.releaseOutputBuffer(out, false);
            if (ended) lastEncoderEos = true;
            return true;
        }

        private void copyVideo() throws IOException {
            ByteBuffer buffer = ByteBuffer.allocateDirect(16 * 1024 * 1024);
            MediaCodec.BufferInfo sample = new MediaCodec.BufferInfo();
            int samples = 0;
            for (int track = 0; track < videoExtractorTracks.length; track++) {
                video.selectTrack(videoExtractorTracks[track]);
                video.seekTo(0, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                while (true) {
                    buffer.clear();
                    int size = video.readSampleData(buffer, 0);
                    if (size < 0) break;
                    if (size >= buffer.capacity()) throw new IOException("Video sample exceeds the copy buffer");
                    samples++;
                    int flags = 0;
                    if ((video.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0) {
                        flags |= MediaCodec.BUFFER_FLAG_KEY_FRAME;
                    }
                    sample.set(0, size, Math.max(0, video.getSampleTime()), flags);
                    buffer.position(0);
                    buffer.limit(size);
                    muxer.writeSampleData(videoMuxerTracks[track], buffer, sample);
                    video.advance();
                }
                video.unselectTrack(videoExtractorTracks[track]);
            }
            if (samples == 0) throw new IOException("Recording video track is empty");
        }
    }

    private static MediaCodec createEncoder(int sampleRate, int bitrate) throws IOException {
        MediaFormat format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 2);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE, android.media.MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16 * 1024);
        MediaCodec encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        encoder.start();
        return encoder;
    }

    private static final class Sibling {
        final Uri uri;
        final String name;
        Sibling(Uri uri, String name) { this.uri = uri; this.name = name; }
    }

    private static Sibling insertSibling(ContentResolver resolver, Uri source) {
        boolean modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        String[] columns = modern
                ? new String[] {MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.TITLE,
                MediaStore.Video.Media.MIME_TYPE, MediaStore.Video.Media.RELATIVE_PATH, MediaStore.Video.Media.DATE_TAKEN}
                : new String[] {MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.TITLE,
                MediaStore.Video.Media.MIME_TYPE, MediaStore.Video.Media.DATA};
        try (Cursor cursor = resolver.query(source, columns, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            String name = stringAt(cursor, 0);
            if (name == null || name.isEmpty()) name = "7B-轉播.mp4";
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Video.Media.MIME_TYPE, textOr(stringAt(cursor, 2), "video/mp4"));
            String title = stringAt(cursor, 1);
            if (title != null) values.put(MediaStore.Video.Media.TITLE, title);
            if (modern) {
                String relative = stringAt(cursor, 3);
                if (relative != null) values.put(MediaStore.Video.Media.RELATIVE_PATH, relative);
                long taken = cursor.isNull(4) ? 0 : cursor.getLong(4);
                if (taken > 0) values.put(MediaStore.Video.Media.DATE_TAKEN, taken);
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            } else {
                String data = stringAt(cursor, 3);
                if (data == null) return null;
                java.io.File original = new java.io.File(data);
                java.io.File parent = original.getParentFile();
                if (parent == null) return null;
                values.put(MediaStore.Video.Media.DATA, new java.io.File(parent, "both-ears-" + name).getAbsolutePath());
            }
            Uri inserted = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
            return inserted == null ? null : new Sibling(inserted, name);
        } catch (RuntimeException error) {
            Log.w(TAG, "Unable to create a balanced recording file", error);
            return null;
        }
    }

    static void discard(Context context, Uri uri) {
        if (context == null || uri == null) return;
        deleteQuietly(context.getContentResolver(), uri);
    }

    private static void publish(ContentResolver resolver, Sibling sibling, long size) {
        ContentValues ready = new ContentValues();
        ready.put(MediaStore.Video.Media.SIZE, size);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ready.put(MediaStore.Video.Media.IS_PENDING, 0);
        resolver.update(sibling.uri, ready, null, null);
    }

    static void restoreName(Context context, Uri uri, String displayName) {
        if (context == null || uri == null || displayName == null || displayName.isEmpty()) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        ContentValues name = new ContentValues();
        name.put(MediaStore.Video.Media.DISPLAY_NAME, displayName);
        try { context.getContentResolver().update(uri, name, null, null); }
        catch (RuntimeException ignored) { }
    }

    private static boolean hasRoom(Context context, Uri source) {
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(source, "r")) {
            if (descriptor == null) return false;
            long size = descriptor.getStatSize();
            StatFs stats = new StatFs(android.os.Environment.getExternalStorageDirectory().getAbsolutePath());
            return stats.getAvailableBytes() >= size + RESERVE_BYTES;
        } catch (Exception error) {
            Log.w(TAG, "Unable to check free space before audio balance", error);
            return true;
        }
    }

    private static int findAudio(MediaExtractor extractor) {
        int found = -1;
        for (int index = 0; index < extractor.getTrackCount(); index++) {
            String mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME);
            if (mime == null || !mime.startsWith("audio/")) continue;
            if (found >= 0) return -1;
            found = index;
        }
        return found;
    }

    private static void requirePcm16(MediaFormat format) throws IOException {
        if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)
                && format.getInteger(MediaFormat.KEY_PCM_ENCODING) != AudioFormat.ENCODING_PCM_16BIT) {
            throw new IOException("Unsupported decoded audio");
        }
    }

    private static int bitrate(MediaFormat format) {
        int bitrate = integer(format, MediaFormat.KEY_BIT_RATE);
        return bitrate >= 96_000 ? bitrate : 128_000;
    }

    private static int integer(MediaFormat format, String key) {
        return format.containsKey(key) ? format.getInteger(key) : 0;
    }

    private static String mime(MediaFormat format) throws IOException {
        String mime = format.getString(MediaFormat.KEY_MIME);
        if (mime == null) throw new IOException("Audio track has no type");
        return mime;
    }

    private static String stringAt(Cursor cursor, int index) {
        return cursor.isNull(index) ? null : cursor.getString(index);
    }

    private static String textOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static void rewind(ParcelFileDescriptor descriptor) throws IOException {
        try { Os.lseek(descriptor.getFileDescriptor(), 0, OsConstants.SEEK_SET); }
        catch (ErrnoException error) { throw new IOException(error); }
    }

    private static void release(MediaCodec codec) {
        if (codec == null) return;
        try { codec.stop(); } catch (RuntimeException ignored) { }
        try { codec.release(); } catch (RuntimeException ignored) { }
    }

    private static void close(ParcelFileDescriptor descriptor) {
        if (descriptor == null) return;
        try { descriptor.close(); } catch (IOException ignored) { }
    }

    private static void deleteQuietly(ContentResolver resolver, Uri uri) {
        try { resolver.delete(uri, null, null); } catch (RuntimeException ignored) { }
    }
}
