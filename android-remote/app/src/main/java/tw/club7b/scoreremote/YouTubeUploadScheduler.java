package tw.club7b.scoreremote;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

final class YouTubeUploadScheduler {
    private static final String PERIODIC = "youtube-upload-periodic";
    private static final String NOW = "youtube-upload-now";

    private YouTubeUploadScheduler() { }

    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.UNMETERED)
                .build();
        WorkManager work = WorkManager.getInstance(context.getApplicationContext());
        work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(YouTubeUploadWorker.class, 15, TimeUnit.MINUTES)
                        .setConstraints(constraints)
                        .build());
        work.enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP,
                new OneTimeWorkRequest.Builder(YouTubeUploadWorker.class)
                        .setConstraints(constraints)
                        .build());
    }

    static void scheduleIfPending(Context context) {
        if (!RecordingUploadStore.pending(context).isEmpty()) schedule(context);
    }

    static void cancelPeriodic(Context context) {
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(PERIODIC);
    }
}
