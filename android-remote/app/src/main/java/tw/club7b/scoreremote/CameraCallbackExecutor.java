package tw.club7b.scoreremote;

import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;

/** CameraX posts encoder buffers from the codec thread. A rejection there kills the process. */
final class CameraCallbackExecutor {
    private CameraCallbackExecutor() { }

    static Executor ignoringRejection(ExecutorService executor) {
        return command -> {
            try {
                executor.execute(command);
            } catch (RejectedExecutionException ignored) {
                // The recorder can still deliver a buffer after its executor has stopped.
            }
        };
    }
}
