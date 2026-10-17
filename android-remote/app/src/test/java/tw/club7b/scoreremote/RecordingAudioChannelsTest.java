package tw.club7b.scoreremote;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class RecordingAudioChannelsTest {
    @Test
    public void keepsSilenceAndMatchedEars() {
        assertEquals(RecordingAudioChannels.BOTH, RecordingAudioChannels.dominantChannel(0, 0));
        assertEquals(RecordingAudioChannels.BOTH, RecordingAudioChannels.dominantChannel(4_000, 4_000));
        assertEquals(RecordingAudioChannels.BOTH, RecordingAudioChannels.dominantChannel(16, 1));
        assertEquals(RecordingAudioChannels.BOTH, RecordingAudioChannels.dominantChannel(1L << 62, (1L << 62) / 8));
    }

    @Test
    public void picksTheOnlyAudibleEar() {
        assertEquals(RecordingAudioChannels.LEFT, RecordingAudioChannels.dominantChannel(17, 1));
        assertEquals(RecordingAudioChannels.LEFT, RecordingAudioChannels.dominantChannel(1L << 62, 1));
        assertEquals(RecordingAudioChannels.LEFT, RecordingAudioChannels.dominantChannel(80, 0));
        assertEquals(RecordingAudioChannels.RIGHT, RecordingAudioChannels.dominantChannel(0, 80));
        assertEquals(RecordingAudioChannels.RIGHT, RecordingAudioChannels.dominantChannel(1, 17));
        assertEquals(RecordingAudioChannels.BOTH, RecordingAudioChannels.dominantChannel(-1, 10));
    }

    @Test
    public void measuresEachEarSeparately() {
        byte[] pcm = new byte[] {(byte) 0xe8, 0x03, 0x00, 0x00};
        long[] energy = new long[2];
        RecordingAudioChannels.addEnergy(energy, pcm, 0, pcm.length, 2);
        assertEquals(1_000_000L, energy[0]);
        assertEquals(0L, energy[1]);
    }

    @Test
    public void copiesTheLouderSamplesIntoBothEars() {
        byte[] stereo = new byte[] {1, 2, 3, 4, 5, 6, 7, 8};
        byte[] both = new byte[8];
        assertEquals(8, RecordingAudioChannels.duplicateChannel(stereo, stereo.length, RecordingAudioChannels.LEFT, both));
        assertArrayEquals(new byte[] {1, 2, 1, 2, 5, 6, 5, 6}, both);
        assertEquals(8, RecordingAudioChannels.duplicateChannel(stereo, stereo.length, RecordingAudioChannels.RIGHT, both));
        assertArrayEquals(new byte[] {3, 4, 3, 4, 7, 8, 7, 8}, both);
    }

    @Test
    public void expandsMonoIntoIdenticalEars() {
        byte[] mono = new byte[] {9, 8, 7, 6};
        byte[] stereo = new byte[8];
        assertEquals(8, RecordingAudioChannels.upmixMono(mono, mono.length, stereo));
        assertArrayEquals(new byte[] {9, 8, 9, 8, 7, 6, 7, 6}, stereo);
    }
}
