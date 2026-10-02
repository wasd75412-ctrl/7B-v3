package tw.club7b.scoreremote;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

final class YouTubeUploadScheduler {
    private static final String PERIODIC = "youtube-upload-periodic";
    private static final String NOW = "youtube-upload-now";
    private static final AtomicBoolean WATCHING = new AtomicBoolean(false);

    private YouTubeUploadScheduler() { }

    static void schedule(Context context) {
        Context app = context.getApplicationContext();
        watchWifi(app);
        enqueue(app, ExistingWorkPolicy.REPLACE);
    }

    static void scheduleIfPending(Context context) {
        Context app = context.getApplicationContext();
        watchWifi(app);
        if (!RecordingUploadStore.pending(app).isEmpty()
                || !RecordingUploadStore.timelineRefresh(app, System.currentTimeMillis()).isEmpty()) {
            enqueue(app, ExistingWorkPolicy.REPLACE);
        }
    }

    static void cancelPeriodic(Context context) {
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(PERIODIC);
    }

    private static void watchWifi(Context context) {
        if (!WATCHING.compareAndSet(false, true)) return;
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) {
            WATCHING.set(false);
            return;
        }
        NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                .build();
        try {
            connectivity.registerNetworkCallback(request, new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network network) {
                    scheduleIfPending(context);
                }
            });
        } catch (RuntimeException error) {
            WATCHING.set(false);
        }
    }

    private static void enqueue(Context context, ExistingWorkPolicy when) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        WorkManager work = WorkManager.getInstance(context);
        work.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE,
                new PeriodicWorkRequest.Builder(YouTubeUploadWorker.class, 15, TimeUnit.MINUTES)
                        .setConstraints(constraints)
                        .build());
        work.enqueueUniqueWork(NOW, when,
                new OneTimeWorkRequest.Builder(YouTubeUploadWorker.class)
                        .setConstraints(constraints)
                        .build());
    }
}
