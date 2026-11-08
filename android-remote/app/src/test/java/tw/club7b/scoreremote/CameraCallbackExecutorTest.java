package tw.club7b.scoreremote;

import static org.junit.Assert.assertFalse;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.Test;

public final class CameraCallbackExecutorTest {
    @Test
    public void lateEncoderCallbackDoesNotThrowAfterShutdown() {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        AtomicBoolean ran = new AtomicBoolean();
        executor.shutdown();
        CameraCallbackExecutor.ignoringRejection(executor).execute(() -> ran.set(true));
        assertFalse(ran.get());
    }
}
