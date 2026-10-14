package tw.club7b.scoreremote;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Queues recordings joined on a computer. adb stages the video in the app's external "imports"
 * folder and writes its JSON manifest last, so a manifest always points at a complete file.
 */
final class RecordingImports {
    static final String FOLDER = "imports";
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private RecordingImports() { }

    static void run(Context context, Runnable onImported) {
        Context app = context.getApplicationContext();
        if (!RUNNING.compareAndSet(false, true)) return;
        EXECUTOR.execute(() -> {
            boolean imported = false;
            try {
                File folder = app.getExternalFilesDir(FOLDER);
                File[] manifests = folder == null ? null : folder.listFiles((dir, name) -> name.endsWith(".json"));
                if (manifests != null) {
                    for (File manifest : manifests) imported |= importOne(app, folder, manifest);
                }
            } finally {
                RUNNING.set(false);
            }
            if (!imported) return;
            YouTubeUploadScheduler.scheduleIfPending(app);
            if (onImported != null) onImported.run();
        });
    }

    private static boolean importOne(Context app, File folder, File manifestFile) {
        Uri saved = null;
        try {
            JSONObject manifest = new JSONObject(new String(Files.readAllBytes(manifestFile.toPath()), StandardCharsets.UTF_8));
            File video = new File(folder, new File(manifest.getString("video")).getName());
            if (!video.isFile()) return false;
            long startMs = manifest.getLong("startMs");
            long endMs = manifest.getLong("endMs");
            List<long[]> pauses = new ArrayList<>();
            JSONArray pauseArray = manifest.optJSONArray("pauses");
            for (int i = 0; pauseArray != null && i < pauseArray.length(); i++) {
                JSONArray pause = pauseArray.optJSONArray(i);
                if (pause != null && pause.length() >= 2) pauses.add(new long[] {pause.getLong(0), pause.getLong(1)});
            }
            saved = copyToGallery(app, video, startMs);
            if (!RecordingUploadStore.addMerged(app, saved, manifest.optString("roomId"), startMs, endMs, pauses)) {
                throw new IllegalStateException("影片太短或時間不正確");
            }
            saved = null;
            if (!video.delete()) video.deleteOnExit();
            if (!manifestFile.delete()) manifestFile.deleteOnExit();
            return true;
        } catch (Exception error) {
            Log.w("7BRecording", "Unable to import merged recording " + manifestFile.getName(), error);
            ErrorLog.record(app, "recording", "合併影片匯入失敗", error);
            if (saved != null) {
                try { app.getContentResolver().delete(saved, null, null); } catch (RuntimeException ignored) { }
            }
            if (!manifestFile.renameTo(new File(manifestFile.getPath() + ".failed"))) manifestFile.deleteOnExit();
            return false;
        }
    }

    private static Uri copyToGallery(Context app, File video, long startMs) throws Exception {
        ContentResolver resolver = app.getContentResolver();
        String name = video.getName();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Video.Media.TITLE, name.replaceFirst("\\.mp4$", ""));
        values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        values.put(MediaStore.Video.Media.DATE_TAKEN, startMs);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/7B控制台/比賽轉播");
            values.put(MediaStore.Video.Media.IS_PENDING, 1);
        } else {
            File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "7B控制台/比賽轉播");
            if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("無法建立影片資料夾");
            File target = new File(directory, name);
            if (target.exists() && !target.delete()) throw new IllegalStateException("影片已存在");
            values.put(MediaStore.Video.Media.DATA, target.getAbsolutePath());
        }
        Uri uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("無法建立影片");
        try (InputStream input = new FileInputStream(video); OutputStream output = resolver.openOutputStream(uri, "w")) {
            if (output == null) throw new IllegalStateException("無法寫入影片");
            byte[] buffer = new byte[1 << 20];
            for (int read; (read = input.read(buffer)) > 0; ) output.write(buffer, 0, read);
        } catch (Exception error) {
            try { resolver.delete(uri, null, null); } catch (RuntimeException ignored) { }
            throw error;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Video.Media.SIZE, video.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) done.put(MediaStore.Video.Media.IS_PENDING, 0);
        resolver.update(uri, done, null, null);
        return uri;
    }
}
