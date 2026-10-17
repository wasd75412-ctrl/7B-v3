package tw.club7b.scoreremote;

/**
 * Phone camcorder profiles often record two microphones as left and right. One of them faces away
 * from the court, so headphones play that video in a single ear while the phone speaker still
 * sounds normal because it mixes both channels.
 */
final class RecordingAudioChannels {
    /** Quieter channel must be below this energy multiple before it is replaced. */
    static final int ENERGY_RATIO = 16;
    static final int LEFT = 0;
    static final int RIGHT = 1;
    static final int BOTH = -1;

    private RecordingAudioChannels() {}

    /** @return {@link #LEFT}, {@link #RIGHT}, or {@link #BOTH} when the ears already match */
    static int dominantChannel(long leftEnergy, long rightEnergy) {
        if (leftEnergy < 0 || rightEnergy < 0 || leftEnergy == rightEnergy) return BOTH;
        long louder = Math.max(leftEnergy, rightEnergy);
        long quieter = Math.min(leftEnergy, rightEnergy);
        if (quieter != 0 && louder / ENERGY_RATIO < quieter) return BOTH;
        if (quieter != 0 && louder / ENERGY_RATIO == quieter && louder % ENERGY_RATIO == 0) return BOTH;
        return leftEnergy > rightEnergy ? LEFT : RIGHT;
    }

    /** Sums squared 16-bit samples. Energies are scaled down together so a long file cannot overflow. */
    static void addEnergy(long[] energy, byte[] pcm, int offset, int length, int channels) {
        int step = channels * 2;
        for (int index = offset; index + step <= offset + length; index += step) {
            for (int channel = 0; channel < channels && channel < 2; channel++) {
                int at = index + channel * 2;
                int sample = (short) ((pcm[at] & 0xff) | ((pcm[at + 1] & 0xff) << 8));
                energy[channel] += (long) sample * sample;
            }
            if (energy[0] > (1L << 60) || energy[1] > (1L << 60)) {
                energy[0] >>>= 1;
                energy[1] >>>= 1;
            }
        }
    }

    /** Copies one stereo channel onto both ears. {@code length} must cover whole 4-byte frames. */
    static int duplicateChannel(byte[] source, int length, int channel, byte[] target) {
        int frames = length / 4;
        int selected = channel == RIGHT ? 2 : 0;
        for (int frame = 0; frame < frames; frame++) {
            int at = frame * 4;
            target[at] = target[at + 2] = source[at + selected];
            target[at + 1] = target[at + 3] = source[at + selected + 1];
        }
        return frames * 4;
    }

    /** Expands mono 16-bit PCM into identical left and right samples. */
    static int upmixMono(byte[] source, int length, byte[] target) {
        int samples = length / 2;
        for (int sample = 0; sample < samples; sample++) {
            int at = sample * 2;
            int out = sample * 4;
            target[out] = target[out + 2] = source[at];
            target[out + 1] = target[out + 3] = source[at + 1];
        }
        return samples * 4;
    }
}
