package tw.club7b.scoreremote;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** App-internal camera that keeps only eighteen completed ten-second clips. */
public final class LoopCameraActivity extends ComponentActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 7;
    private static final long SEGMENT_MS = 10_000L;
    private static final long RECORDING_RECOVERY_MS = 750L;
    private static final int SEGMENT_LIMIT = 18;
    private final ArrayDeque<File> segments = new ArrayDeque<>();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable rotate = this::stopSegment;
    private final Runnable recoverRecording = this::startSegmentIfVisible;
    private PreviewView previewView;
    private TextView status;
    private VideoCapture<Recorder> videoCapture;
    private Recording recording;
    private File activeFile;
    private boolean closing;
    private boolean explicitExit;
    private boolean saveAfterFinalize;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        RemoteSessionStore.setRecordingEnabled(this, true);
        buildUi();
        if (hasPermission(Manifest.permission.CAMERA)) startCamera();
        else requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, CAMERA_PERMISSION_REQUEST);
    }

    @Override public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (hasPermission(Manifest.permission.CAMERA)) startCamera();
        else { Toast.makeText(this, "需要相機權限才能循環錄影", Toast.LENGTH_LONG).show(); exitRecording(); }
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(22, 14, 22, 14); bar.setBackgroundColor(0xB0000000);
        status = new TextView(this); status.setTextColor(Color.WHITE); status.setTextSize(17f); status.setText("相機準備中…");
        bar.addView(status, new LinearLayout.LayoutParams(0, -2, 1f));
        Button save = new Button(this); save.setText("保存最近 3 分鐘"); save.setOnClickListener(v -> saveRecentVideo()); bar.addView(save);
        Button close = new Button(this); close.setText("結束"); close.setOnClickListener(v -> exitRecording()); bar.addView(close);
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        setContentView(root, new ViewGroup.LayoutParams(-1, -1));
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (closing || isFinishing() || isDestroyed()) return;
            try {
                ProcessCameraProvider provider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                Recorder recorder = new Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.HD)).build();
                videoCapture = VideoCapture.withOutput(recorder);
                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, videoCapture);
                startSegmentIfVisible();
            } catch (Exception error) {
                status.setText("相機啟動失敗");
                Toast.makeText(this, String.valueOf(error.getMessage()), Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void startSegment() {
        if (closing || recording != null || videoCapture == null) return;
        File dir = new File(getCacheDir(), "rolling-video");
        if (!dir.exists() && !dir.mkdirs()) { Toast.makeText(this, "無法建立暫存區", Toast.LENGTH_LONG).show(); return; }
        activeFile = new File(dir, "segment-" + System.currentTimeMillis() + ".mp4");
        try {
            PendingRecording pending = videoCapture.getOutput().prepareRecording(this, new FileOutputOptions.Builder(activeFile).build());
            if (hasPermission(Manifest.permission.RECORD_AUDIO)) pending = pending.withAudioEnabled();
            recording = pending.start(ContextCompat.getMainExecutor(this), this::onVideoEvent);
            status.setText("● 循環錄影中 · 僅暫存最近 3 分鐘");
            handler.postDelayed(rotate, SEGMENT_MS);
        } catch (RuntimeException error) {
            Log.w("7BRecording", "Recording start interrupted", error);
            recording = null;
            if (activeFile != null) activeFile.delete();
            activeFile = null;
            status.setText("正在恢復錄影…");
            scheduleRecordingRecovery();
        }
    }

    private void startSegmentIfVisible() {
        handler.removeCallbacks(recoverRecording);
        if (closing || isFinishing() || isDestroyed()) return;
        if (!getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) return;
        startSegment();
    }

    private void scheduleRecordingRecovery() {
        handler.removeCallbacks(recoverRecording);
        if (!closing) handler.postDelayed(recoverRecording, RECORDING_RECOVERY_MS);
    }

    private void stopSegment() { handler.removeCallbacks(rotate); if (recording != null) recording.stop(); }

    private void onVideoEvent(@NonNull VideoRecordEvent event) {
        if (!(event instanceof VideoRecordEvent.Finalize)) return;
        VideoRecordEvent.Finalize finalized = (VideoRecordEvent.Finalize) event;
        recording = null;
        File finished = activeFile; activeFile = null;
        if (!finalized.hasError() && finished != null && finished.length() > 0) {
            segments.addLast(finished);
            while (segments.size() > SEGMENT_LIMIT) { File old = segments.removeFirst(); if (!old.delete()) old.deleteOnExit(); }
        } else if (finished != null) finished.delete();
        if (saveAfterFinalize) { saveAfterFinalize = false; if (!closing) persistSegments(); }
        if (!closing) scheduleRecordingRecovery();
    }

    private void exitRecording() {
        explicitExit = true;
        closing = true;
        RemoteSessionStore.setRecordingEnabled(this, false);
        finish();
    }

    @Override public void onBackPressed() {
        exitRecording();
    }

    @Override protected void onResume() {
        super.onResume();
        if (!explicitExit) {
            RemoteSessionStore.setRecordingEnabled(this, true);
            scheduleRecordingRecovery();
        }
    }

    @Override protected void onPause() {
        handler.removeCallbacks(recoverRecording);
        super.onPause();
    }

    private void saveRecentVideo() {
        if (recording != null) {
            saveAfterFinalize = true;
            status.setText("正在完成目前片段…");
            stopSegment();
            return;
        }
        persistSegments();
    }

    private void persistSegments() {
        if (closing || io.isShutdown()) return;
        List<File> snapshot = new ArrayList<>(segments);
        if (snapshot.isEmpty()) { Toast.makeText(this, "第一段仍在錄製，請稍候", Toast.LENGTH_SHORT).show(); return; }
        status.setText("正在合併最近 3 分鐘…");
        io.execute(() -> {
            String group = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.TAIWAN).format(new Date());
            android.net.Uri savedUri = null;
            try {
                savedUri = mergeDirectlyToGallery(snapshot, group);
            } catch (Exception ignored) {
                savedUri = null;
            }
            android.net.Uri savedVideoUri = savedUri;
            boolean success = savedVideoUri != null;
            runOnUiThread(() -> {
                if (closing || isFinishing() || isDestroyed()) return;
                status.setText("● 循環錄影中 · 僅暫存最近 3 分鐘");
                Toast.makeText(this, success ? "已保存一個最近 3 分鐘影片" : "影片合併或保存失敗", Toast.LENGTH_LONG).show();
                if (success) openSavedVideo(savedVideoUri);
            });
        });
    }

    private void openSavedVideo(android.net.Uri uri) {
        Intent exactVideo = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "video/mp4")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        exactVideo.setClipData(ClipData.newRawUri("最近保存的三分鐘影片", uri));
        Intent samsungGallery = new Intent(exactVideo).setPackage("com.sec.android.gallery3d");
        try {
            startActivity(samsungGallery);
            return;
        } catch (Exception ignored) {
        }
        try {
            startActivity(exactVideo);
        } catch (Exception exactVideoError) {
            Intent openVideos = new Intent(Intent.ACTION_VIEW, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                startActivity(openVideos);
            } catch (Exception ignored) {
                Toast.makeText(this, "影片已保存，請從媒體庫的 7B羽球 資料夾開啟", Toast.LENGTH_LONG).show();
            }
        }
    }

    private android.net.Uri mergeDirectlyToGallery(List<File> sources, String group) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, "7B-" + group + ".mp4");
        values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/7B羽球");
            values.put(MediaStore.Video.Media.IS_PENDING, 1);
        }
        android.net.Uri uri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("無法建立媒體庫影片");
        try (ParcelFileDescriptor output = getContentResolver().openFileDescriptor(uri, "rw")) {
            if (output == null) throw new IllegalStateException("無法開啟媒體庫影片");
            mergeSegments(sources, output);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Video.Media.IS_PENDING, 0);
                getContentResolver().update(uri, ready, null, null);
            }
            return uri;
        } catch (Exception error) {
            getContentResolver().delete(uri, null, null);
            throw error;
        }
    }

    private void mergeSegments(List<File> sources, ParcelFileDescriptor destination) throws Exception {
        MediaExtractor first = new MediaExtractor();
        first.setDataSource(sources.get(0).getAbsolutePath());
        MediaMuxer muxer = new MediaMuxer(destination.getFileDescriptor(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        List<TrackInfo> tracks = new ArrayList<>();
        try {
            for (int i = 0; i < first.getTrackCount(); i++) {
                MediaFormat format = first.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null || (!mime.startsWith("video/") && !mime.startsWith("audio/"))) continue;
                tracks.add(new TrackInfo(mime, muxer.addTrack(format)));
            }
            if (tracks.isEmpty()) throw new IllegalStateException("找不到影片軌道");
            setOrientationHint(muxer, sources.get(0));
            muxer.start();
            long segmentBaseUs = 0L;
            for (File source : sources) {
                long segmentDurationUs = 0L;
                for (TrackInfo track : tracks) {
                    long duration = appendTrack(source, track, muxer, segmentBaseUs);
                    segmentDurationUs = Math.max(segmentDurationUs, duration);
                }
                segmentBaseUs += Math.max(1L, segmentDurationUs + 1L);
            }
        } finally {
            first.release();
            try { muxer.stop(); } catch (Exception ignored) { }
            muxer.release();
        }
    }

    private long appendTrack(File source, TrackInfo target, MediaMuxer muxer, long baseUs) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(source.getAbsolutePath());
            int sourceTrack = -1;
            int bufferSize = 2 * 1024 * 1024;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                if (!target.mime.equals(format.getString(MediaFormat.KEY_MIME))) continue;
                sourceTrack = i;
                if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) bufferSize = Math.max(bufferSize, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));
                break;
            }
            if (sourceTrack < 0) return 0L;
            extractor.selectTrack(sourceTrack);
            ByteBuffer buffer = ByteBuffer.allocateDirect(bufferSize);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long firstTimeUs = -1L;
            long lastRelativeUs = 0L;
            while (true) {
                buffer.clear();
                int size = extractor.readSampleData(buffer, 0);
                if (size < 0) break;
                long sampleTimeUs = extractor.getSampleTime();
                if (firstTimeUs < 0L) firstTimeUs = sampleTimeUs;
                lastRelativeUs = Math.max(0L, sampleTimeUs - firstTimeUs);
                info.set(0, size, baseUs + lastRelativeUs, extractor.getSampleFlags());
                muxer.writeSampleData(target.muxerTrack, buffer, info);
                extractor.advance();
            }
            return lastRelativeUs;
        } finally {
            extractor.release();
        }
    }

    private void setOrientationHint(MediaMuxer muxer, File source) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(source.getAbsolutePath());
            String rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            if (rotation != null) muxer.setOrientationHint(Integer.parseInt(rotation));
        } catch (Exception ignored) {
        } finally {
            try { retriever.release(); } catch (Exception ignored) { }
        }
    }

    private static final class TrackInfo {
        final String mime;
        final int muxerTrack;
        TrackInfo(String mime, int muxerTrack) { this.mime = mime; this.muxerTrack = muxerTrack; }
    }

    @Override protected void onDestroy() {
        closing = true; handler.removeCallbacks(rotate); handler.removeCallbacks(recoverRecording); if (recording != null) recording.stop(); io.shutdown();
        if (explicitExit) RemoteSessionStore.setRecordingEnabled(this, false);
        super.onDestroy();
    }
}
