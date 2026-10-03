package tw.club7b.scoreremote;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.ForegroundInfo;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.tasks.Tasks;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.nio.channels.FileChannel;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public final class YouTubeUploadWorker extends Worker {
    private static final ReentrantLock RUNNING = new ReentrantLock();
    private static final String CHANNEL_ID = "youtube_upload";
    private static final int NOTIFICATION_ID = 7201;

    public YouTubeUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        if (!RUNNING.tryLock()) return Result.success();
        try {
            Context context = getApplicationContext();
            List<RecordingUploadStore.Entry> pending = RecordingUploadStore.pending(context);
            List<RecordingUploadStore.Entry> refresh = RecordingUploadStore.timelineRefresh(context, System.currentTimeMillis());
            if (pending.isEmpty() && refresh.isEmpty()) {
                YouTubeUploadScheduler.cancelPeriodic(context);
                return Result.success();
            }
            if (!HomeWifi.isConnected(context)) {
                String waiting = HomeWifi.isHotspotOnly(context) ? "個人熱點不上傳" : "等待 Wi-Fi";
                for (RecordingUploadStore.Entry entry : pending) mark(entry, RecordingUploadStore.Status.WAITING, waiting);
                return Result.success();
            }
            YouTubeAuth auth = new YouTubeAuth(context);
            if (token(auth) == null) {
                for (RecordingUploadStore.Entry entry : pending) mark(entry, RecordingUploadStore.Status.AUTH_REQUIRED, "");
                return Result.success();
            }
            String foregroundTitle = pending.isEmpty() ? refresh.get(0).title : pending.get(0).title;
            goForeground(foregroundTitle);
            for (RecordingUploadStore.Entry entry : pending) {
                if (isStopped() || !HomeWifi.isConnected(context)) break;
                upload(entry, auth);
            }
            for (RecordingUploadStore.Entry entry : refresh) {
                if (isStopped() || !HomeWifi.isConnected(context)) break;
                refreshTimeline(entry, auth);
            }
            return Result.success();
        } finally {
            RUNNING.unlock();
        }
    }

    private void upload(RecordingUploadStore.Entry entry, YouTubeAuth auth) {
        Context context = getApplicationContext();
        try {
            if (entry.videoId.isEmpty()) {
                if (entry.title.isEmpty()) {
                    entry.title = RecordingTimeline.title(entry.startMs, RecordingUploadStore.ordinal(context, entry));
                }
                if (!RecordingTimeline.hasGameChapter(entry.description)) entry.description = timeline(entry);
                try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(Uri.parse(entry.uri), "r");
                     FileInputStream input = new FileInputStream(descriptor.getFileDescriptor());
                     FileChannel channel = input.getChannel()) {
                    long length = descriptor.getStatSize();
                    if (length <= 0L) throw new FileNotFoundException(entry.uri);
                    if (entry.sessionUrl.isEmpty()) {
                        entry.sessionUrl = withToken(auth, token -> YouTubeUploader.createSession(token, entry.title, entry.description, length));
                    }
                    mark(entry, RecordingUploadStore.Status.UPLOADING, "");
                    goForeground(entry.title);
                    String videoId = withToken(auth, token -> YouTubeUploader.upload(entry.sessionUrl, token, channel, length,
                            new YouTubeUploader.Progress() {
                                @Override public boolean keepGoing() {
                                    return !isStopped();
                                }

                                @Override public void onProgress(long sent, long total) {
                                    int percent = (int) Math.min(99L, sent * 100L / Math.max(1L, total));
                                    if (percent != entry.progress) {
                                        entry.progress = percent;
                                        RecordingUploadStore.save(context, entry);
                                    }
                                }
                            }));
                    if (videoId == null) {
                        mark(entry, RecordingUploadStore.Status.WAITING, "");
                        return;
                    }
                    entry.videoId = videoId;
                    entry.progress = 100;
                    RecordingUploadStore.save(context, entry);
                }
            }
            if (!entry.playlistAdded) {
                addToPlaylist(entry, auth);
                entry.playlistAdded = true;
            }
            mark(entry, RecordingUploadStore.Status.UPLOADED, "");
        } catch (FileNotFoundException | SecurityException missing) {
            mark(entry, RecordingUploadStore.Status.MISSING, "");
        } catch (YouTubeUploader.HttpError error) {
            Log.w("7BYouTube", "Upload failed", error);
            if (error.code == 401) {
                mark(entry, RecordingUploadStore.Status.AUTH_REQUIRED, "");
            } else if (error.code == 404 || error.code == 410) {
                entry.sessionUrl = "";
                mark(entry, RecordingUploadStore.Status.WAITING, "");
            } else if (error.isQuota()) {
                mark(entry, RecordingUploadStore.Status.WAITING, "今日上傳額度已滿");
            } else if (error.code >= 500) {
                mark(entry, RecordingUploadStore.Status.WAITING, "");
            } else {
                mark(entry, RecordingUploadStore.Status.FAILED, "HTTP " + error.code);
            }
        } catch (Exception error) {
            Log.w("7BYouTube", "Upload interrupted", error);
            if (error instanceof TokenMissing) mark(entry, RecordingUploadStore.Status.AUTH_REQUIRED, "");
            else mark(entry, RecordingUploadStore.Status.WAITING, "");
        }
    }

    private void addToPlaylist(RecordingUploadStore.Entry entry, YouTubeAuth auth) throws Exception {
        Context context = getApplicationContext();
        String playlistId = RecordingUploadStore.playlistId(context);
        if (!playlistId.isEmpty()) {
            try {
                final String cached = playlistId;
                withToken(auth, token -> { YouTubeUploader.addToPlaylist(token, cached, entry.videoId); return cached; });
                return;
            } catch (YouTubeUploader.HttpError error) {
                if (error.code != 404) throw error;
                RecordingUploadStore.setPlaylistId(context, "");
            }
        }
        String found = withToken(auth, YouTubeUploader::findOrCreatePlaylist);
        RecordingUploadStore.setPlaylistId(context, found);
        withToken(auth, token -> { YouTubeUploader.addToPlaylist(token, found, entry.videoId); return found; });
    }

    private void refreshTimeline(RecordingUploadStore.Entry entry, YouTubeAuth auth) {
        try {
            String fresh = timeline(entry);
            if (!RecordingTimeline.hasGameChapter(fresh) || fresh.equals(entry.description)) return;
            if (RecordingTimeline.gameCount(fresh) < RecordingTimeline.gameCount(entry.description)) return;
            Context context = getApplicationContext();
            String title = entry.title.isEmpty()
                    ? RecordingTimeline.title(entry.startMs, RecordingUploadStore.ordinal(context, entry)) : entry.title;
            withToken(auth, token -> {
                YouTubeUploader.updateDescription(token, entry.videoId, title, fresh);
                return token;
            });
            entry.title = title;
            entry.description = fresh;
            RecordingUploadStore.save(context, entry);
        } catch (Exception error) {
            Log.w("7BYouTube", "Could not refresh timeline", error);
        }
    }

    private String timeline(RecordingUploadStore.Entry entry) {
        Map<String, Object> room = new HashMap<>();
        if (!entry.roomId.isEmpty()) {
            try {
                Map<String, Object> loaded = Tasks.await(MatchHistoryRooms.load(
                        BackgroundScoreController.firestore(getApplicationContext()), entry.roomId, entry.startMs), 30, TimeUnit.SECONDS);
                if (loaded != null) room = loaded;
            } catch (Exception error) {
                Log.w("7BYouTube", "Could not load match history", error);
            }
        }
        return RecordingTimeline.timeline(RecordingTimeline.matchesFromRoom(room), entry.startMs, entry.endMs, entry.pauses);
    }

    private interface TokenCall<T> {
        T run(String token) throws Exception;
    }

    private static final class TokenMissing extends Exception { }

    private static <T> T withToken(YouTubeAuth auth, TokenCall<T> call) throws Exception {
        String token = token(auth);
        if (token == null) throw new TokenMissing();
        try {
            return call.run(token);
        } catch (YouTubeUploader.HttpError error) {
            if (error.code != 401) throw error;
            String fresh = auth.refresh();
            if (fresh == null) throw new TokenMissing();
            return call.run(fresh);
        }
    }

    private static String token(YouTubeAuth auth) {
        try {
            return auth.token();
        } catch (Exception error) {
            Log.w("7BYouTube", "Authorization unavailable", error);
            return null;
        }
    }

    private void mark(RecordingUploadStore.Entry entry, RecordingUploadStore.Status status, String message) {
        entry.status = status;
        entry.message = message;
        RecordingUploadStore.save(getApplicationContext(), entry);
    }

    private void goForeground(String title) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "YouTube 上傳", NotificationManager.IMPORTANCE_LOW));
        }
        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("上傳 YouTube")
                .setContentText(title == null || title.isEmpty() ? "準備上傳" : title)
                .setOngoing(true)
                .build();
        ForegroundInfo info = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? new ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                : new ForegroundInfo(NOTIFICATION_ID, notification);
        try {
            setForegroundAsync(info).get(5, TimeUnit.SECONDS);
        } catch (Exception error) {
            Log.w("7BYouTube", "Upload continues without foreground service", error);
        }
    }
}
