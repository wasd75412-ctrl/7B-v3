package tw.club7b.scoreremote;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.LinearGradient;
import android.graphics.Shader;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.TonemapCurve;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.HandlerThread;
import android.provider.MediaStore;
import android.util.Log;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2CameraControl;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.CaptureRequestOptions;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.CameraEffect;
import androidx.camera.core.DynamicRange;
import androidx.camera.core.Preview;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.core.UseCaseGroup;
import androidx.camera.effects.OverlayEffect;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.MediaStoreOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/** App-internal camera that records score broadcast videos straight into the gallery. */
public final class LoopCameraActivity extends ComponentActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 7;
    private static final long RECORDING_RECOVERY_MS = 750L;
    private static final String QUALITY_PREFS = "recording_video_quality";
    private static final String QUALITY_KEY = "quality";
    private static final List<String> QUALITY_ORDER = Arrays.asList("uhd", "fhd", "hd");
    private final List<String> supportedQualities = new ArrayList<>(QUALITY_ORDER);
    private static final java.util.concurrent.atomic.AtomicInteger OPEN_SESSIONS = new java.util.concurrent.atomic.AtomicInteger();
    private boolean sessionCounted;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final HandlerThread overlayThread = new HandlerThread("7BScoreOverlay");
    private android.os.Handler overlayHandler;
    private final ExecutorService recordingExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService savedRecordingExecutor = Executors.newSingleThreadExecutor();
    private final Runnable recoverRecording = this::startRecordingIfVisible;
    private final P4GestureInterpreter p4Gestures = new P4GestureInterpreter();
    private Runnable pendingP4Settle;
    private final VolumeKeyInterpreter cameraKeys = new VolumeKeyInterpreter();
    private Runnable pendingCameraLongPress;
    private BackgroundScoreController remoteScoreController;
    private FrameLayout recordingStage;
    private int stagedWindowWidth = -1;
    private int stagedWindowHeight = -1;
    private PreviewView previewView;
    private Button qualityButton;
    private Button pauseButton;
    private boolean paused;
    private long pauseStartedAt;
    private final List<long[]> pauses = new ArrayList<>();
    private ProcessCameraProvider cameraProvider;
    private boolean qualityRestartRequested;
    private android.view.View scorePreviewOverlay;
    private TextView status;
    private VideoCapture<Recorder> videoCapture;
    private OverlayEffect scoreOverlayEffect;
    private LiveMatchOverlayController liveMatchOverlay;
    private final AtomicReference<LiveMatchOverlayController.OverlayState> overlayState =
            new AtomicReference<>(LiveMatchOverlayController.OverlayState.waiting());
    private Recording recording;
    private boolean closing;
    private boolean explicitExit;
    private boolean broadcastSaveRequested;
    private boolean broadcastExitRequested;
    private boolean abandonRecording;
    private boolean broadcastStartReported;
    private long broadcastFileStartedAt;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        overlayThread.start();
        overlayHandler = new android.os.Handler(overlayThread.getLooper());
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        RemoteSessionStore.setRecordingEnabled(this, true);
        sessionCounted = true;
        OPEN_SESSIONS.incrementAndGet();
        remoteScoreController = new BackgroundScoreController(this);
        remoteScoreController.warmUp((success, message) -> { });
        buildUi();
        bindBroadcastScoreSource();
        String[] missing = missingRecordingPermissions();
        if (missing.length == 0) startCamera();
        else requestPermissions(missing, CAMERA_PERMISSION_REQUEST);
    }

    @Override public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (!hasPermission(Manifest.permission.CAMERA)) {
            Toast.makeText(this, "需要相機權限才能錄影", Toast.LENGTH_LONG).show();
            exitRecording();
        } else if (needsLegacyStoragePermission()) {
            Toast.makeText(this, "需要儲存權限才能保存影片", Toast.LENGTH_LONG).show();
            exitRecording();
        } else {
            startCamera();
        }
    }

    private String[] missingRecordingPermissions() {
        List<String> missing = new ArrayList<>();
        if (!hasPermission(Manifest.permission.CAMERA)) {
            missing.add(Manifest.permission.CAMERA);
            missing.add(Manifest.permission.RECORD_AUDIO);
        }
        if (needsLegacyStoragePermission()) missing.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        return missing.toArray(new String[0]);
    }

    // Android 9 and older need storage access to insert recordings into MediaStore.
    private boolean needsLegacyStoragePermission() {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && !hasPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE);
    }

    @Override public boolean onKeyDown(int keyCode, android.view.KeyEvent event) {
        if (consumeP4Key(event)) return true;
        if (keyCode == android.view.KeyEvent.KEYCODE_CAMERA) {
            handleRecordingCameraKey(event);
            return true;
        }
        if (isRecordingVolumeKey(keyCode)) return true;
        return super.onKeyDown(keyCode, event);
    }

    @Override public boolean onKeyUp(int keyCode, android.view.KeyEvent event) {
        if (consumeP4Key(event)) return true;
        if (keyCode == android.view.KeyEvent.KEYCODE_CAMERA) {
            handleRecordingCameraKey(event);
            return true;
        }
        if (isRecordingVolumeKey(keyCode)) return true;
        return super.onKeyUp(keyCode, event);
    }

    private void handleRecordingCameraKey(android.view.KeyEvent event) {
        int keyCode = android.view.KeyEvent.KEYCODE_CAMERA;
        VolumeKeyInterpreter.Action action = VolumeKeyInterpreter.Action.NONE;
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
            action = cameraKeys.onKeyDown(keyCode, event.getEventTime(), event.getRepeatCount());
            if (event.getRepeatCount() == 0) scheduleRecordingCameraLongPress(event.getEventTime());
            if (action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) cancelRecordingCameraLongPress();
        } else if (event.getAction() == android.view.KeyEvent.ACTION_UP) {
            cancelRecordingCameraLongPress();
            action = cameraKeys.onKeyUp(keyCode, event.getEventTime());
        }
        if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE) {
            CameraButtonGesture.shared().onShortPress(event.getEventTime(), recordingCameraCallbacks);
        } else if (action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
            CameraButtonGesture.shared().onLongPress(event.getEventTime(), recordingCameraCallbacks);
        }
    }

    private final CameraButtonGesture.Callbacks recordingCameraCallbacks = new CameraButtonGesture.Callbacks() {
        @Override public void undo() { sendRecordingCameraAction(VolumeKeyInterpreter.Action.UNDO); }
        @Override public void useShuttle() { sendRecordingCameraAction(VolumeKeyInterpreter.Action.USE_SHUTTLE); }
        @Override public void returnShuttle() { sendRecordingCameraAction(VolumeKeyInterpreter.Action.RETURN_SHUTTLE); }
    };

    private void sendRecordingCameraAction(VolumeKeyInterpreter.Action action) {
        if (remoteScoreController == null) remoteScoreController = new BackgroundScoreController(this);
        if (action == VolumeKeyInterpreter.Action.UNDO) {
            remoteScoreController.submit(action, (success, message, completedAction) -> handler.post(() ->
                    Toast.makeText(LoopCameraActivity.this, message, Toast.LENGTH_SHORT).show()));
            return;
        }
        BackgroundScoreController.FullscreenCallback callback = (success, message) -> handler.post(() ->
                Toast.makeText(LoopCameraActivity.this, message, Toast.LENGTH_SHORT).show());
        if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE) remoteScoreController.useOneShuttle(callback);
        else remoteScoreController.returnOneShuttle(callback);
    }

    private void scheduleRecordingCameraLongPress(long pressedAt) {
        cancelRecordingCameraLongPress();
        pendingCameraLongPress = () -> {
            pendingCameraLongPress = null;
            VolumeKeyInterpreter.Action action = cameraKeys.onLongPressTimeout(
                    android.view.KeyEvent.KEYCODE_CAMERA,
                    pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS
            );
            if (action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
                CameraButtonGesture.shared().onLongPress(pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS, recordingCameraCallbacks);
            }
        };
        handler.postDelayed(pendingCameraLongPress, VolumeKeyInterpreter.LONG_PRESS_MS);
    }

    private void cancelRecordingCameraLongPress() {
        if (pendingCameraLongPress == null) return;
        handler.removeCallbacks(pendingCameraLongPress);
        pendingCameraLongPress = null;
    }

    private static boolean isRecordingVolumeKey(int keyCode) {
        return keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP
                || keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN;
    }

    @Override public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (deliverP4Gesture(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (deliverP4Gesture(event)) return true;
        return super.dispatchTouchEvent(event);
    }

    private boolean consumeP4Key(android.view.KeyEvent event) {
        if (event == null || event.getDevice() == null
                || !P4GestureInterpreter.isP4Name(event.getDevice().getName())) return false;
        if (event.getAction() == android.view.KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0
                && P4GestureInterpreter.isOfficialStartKey(event.getDevice().getName(), event.getKeyCode())) {
            if (remoteScoreController == null) remoteScoreController = new BackgroundScoreController(this);
            remoteScoreController.startOfficialMatch((success, message) -> handler.post(() ->
                    Toast.makeText(LoopCameraActivity.this, message, Toast.LENGTH_SHORT).show()));
        }
        return true;
    }

    private boolean deliverP4Gesture(MotionEvent event) {
        if (!p4Gestures.isP4Event(event)) return false;
        VolumeKeyInterpreter.Action action = p4Gestures.onTouchEvent(
                event, getResources().getDisplayMetrics().density);
        if (action != VolumeKeyInterpreter.Action.NONE) {
            if (pendingP4Settle != null) handler.removeCallbacks(pendingP4Settle);
            pendingP4Settle = null;
            deliverP4Action(action, event.getEventTime());
        } else if (p4Gestures.isTracking()) {
            if (pendingP4Settle != null) handler.removeCallbacks(pendingP4Settle);
            pendingP4Settle = () -> {
                pendingP4Settle = null;
                long settledAt = android.os.SystemClock.uptimeMillis();
                VolumeKeyInterpreter.Action settled = p4Gestures.finishTracking(settledAt);
                if (settled != VolumeKeyInterpreter.Action.NONE) deliverP4Action(settled, settledAt);
            };
            handler.postDelayed(pendingP4Settle, 120L);
        }
        return true;
    }

    private void deliverP4Action(VolumeKeyInterpreter.Action action, long inputAt) {
        if (remoteScoreController == null) remoteScoreController = new BackgroundScoreController(this);
        BackgroundScoreController.FullscreenCallback toast = (success, message) -> handler.post(() ->
                Toast.makeText(LoopCameraActivity.this, message, Toast.LENGTH_SHORT).show());
        switch (action) {
            case USE_SHUTTLE:
                remoteScoreController.useOneShuttle(toast);
                return;
            case RETURN_SHUTTLE:
                remoteScoreController.returnOneShuttle(toast);
                return;
            case TEAM_A_PLUS:
            case TEAM_B_PLUS:
            case UNDO:
                remoteScoreController.submitDirect(action, (success, message, completedAction) -> handler.post(() ->
                        Toast.makeText(LoopCameraActivity.this, message, Toast.LENGTH_SHORT).show()), inputAt);
                return;
            default:
                return;
        }
    }

    private void buildUi() {
        FrameLayout window = new FrameLayout(this);
        window.setBackgroundColor(Color.BLACK);
        recordingStage = new FrameLayout(this);
        recordingStage.setBackgroundColor(Color.BLACK);
        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        previewView.setFocusable(false);
        previewView.setFocusableInTouchMode(false);
        recordingStage.addView(previewView, new FrameLayout.LayoutParams(-1, -1));
        scorePreviewOverlay = new android.view.View(this) {
            @Override protected void onDraw(android.graphics.Canvas canvas) {
                super.onDraw(canvas);
                drawScoreBoard(canvas, 0f, 0f, getWidth(), getHeight(), overlayState.get());
            }
        };
        scorePreviewOverlay.setClickable(false);
        recordingStage.addView(scorePreviewOverlay, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(22, 14, 22, 14);
        bar.setBackgroundColor(0xB0000000);
        status = new TextView(this); status.setTextColor(Color.WHITE); status.setTextSize(17f); status.setText("相機準備中…");
        status.setPadding(22, 14, 22, 14);
        status.setBackgroundColor(0xB0000000);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        recordingStage.addView(status, statusParams);
        qualityButton = new Button(this);
        qualityButton.setText(qualityLabel(savedQuality()));
        prepareActionButton(qualityButton);
        qualityButton.setOnClickListener(v -> cycleQuality());
        bar.addView(qualityButton);
        pauseButton = new Button(this); pauseButton.setText("暫停"); prepareActionButton(pauseButton); pauseButton.setOnClickListener(v -> togglePause()); bar.addView(pauseButton);
        Button save = new Button(this); save.setText("保存並繼續"); prepareActionButton(save); save.setOnClickListener(v -> saveBroadcastAndContinue()); bar.addView(save);
        Button close = new Button(this); close.setText("結束"); prepareActionButton(close); close.setOnClickListener(v -> {
            close.setEnabled(false);
            close.setText("結束中…");
            exitRecording();
        }); bar.addView(close);
        bar.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        FrameLayout.LayoutParams actionParams = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        recordingStage.addView(bar, actionParams);
        Button back = new Button(this);
        back.setText("返回");
        prepareActionButton(back);
        back.setOnClickListener(v -> returnWithoutAction());
        FrameLayout.LayoutParams backParams = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        recordingStage.addView(back, backParams);
        ViewCompat.setOnApplyWindowInsetsListener(window, (view, windowInsets) -> {
            androidx.core.graphics.Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            statusParams.bottomMargin = 14 + systemBars.left;
            status.setLayoutParams(statusParams);
            actionParams.topMargin = 14 + systemBars.right;
            actionParams.rightMargin = 14 + systemBars.bottom;
            backParams.leftMargin = 22 + systemBars.top;
            backParams.bottomMargin = 14 + systemBars.left;
            back.setLayoutParams(backParams);
            bar.setLayoutParams(actionParams);
            return windowInsets;
        });
        window.setClipChildren(false);
        window.setClipToPadding(false);
        window.addView(recordingStage, new FrameLayout.LayoutParams(-1, -1));
        window.addOnLayoutChangeListener((v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
                orientRecordingStage(right - left, bottom - top));
        setContentView(window, new ViewGroup.LayoutParams(-1, -1));
        View decor = getWindow().getDecorView();
        if (decor instanceof ViewGroup) {
            ((ViewGroup) decor).setClipChildren(false);
            ((ViewGroup) decor).setClipToPadding(false);
        }
    }

    /** Keep the window in the remote's portrait coordinate space and rotate the preview upright for the landscape grip. */
    private void orientRecordingStage(int windowWidth, int windowHeight) {
        if (recordingStage == null || windowWidth <= 0 || windowHeight <= 0) return;
        if (windowWidth == stagedWindowWidth && windowHeight == stagedWindowHeight) return;
        stagedWindowWidth = windowWidth;
        stagedWindowHeight = windowHeight;
        recordingStage.setLayoutParams(new FrameLayout.LayoutParams(windowHeight, windowWidth));
        recordingStage.post(() -> {
            if (recordingStage == null || recordingStage.getWidth() <= 0 || recordingStage.getHeight() <= 0) return;
            recordingStage.setPivotX(recordingStage.getWidth() / 2f);
            recordingStage.setPivotY(recordingStage.getHeight() / 2f);
            recordingStage.setRotation(90f);
            recordingStage.setTranslationX((windowWidth - windowHeight) / 2f);
            recordingStage.setTranslationY((windowHeight - windowWidth) / 2f);
        });
    }

    private void prepareActionButton(Button button) {
        float density = getResources().getDisplayMetrics().density;
        button.setMinHeight(Math.round(56f * density));
        button.setMinWidth(Math.round(88f * density));
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (closing || isFinishing() || isDestroyed()) return;
            try {
                cameraProvider = future.get();
                loadSupportedQualities();
                if (scoreOverlayEffect == null) scoreOverlayEffect = createScoreOverlayEffect();
                if (!rebindSelectedQuality()) {
                    status.setText("相機啟動失敗");
                    return;
                }
                startRecordingIfVisible();
            } catch (Exception error) {
                status.setText("相機啟動失敗");
                Toast.makeText(this, String.valueOf(error.getMessage()), Toast.LENGTH_LONG).show();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    /** Camcorder profiles decide what the encoder really produces, so 4K is hidden on phones that would silently record 1080p. */
    private void loadSupportedQualities() {
        try {
            List<Quality> available = Recorder.getVideoCapabilities(
                    cameraProvider.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA)).getSupportedQualities(DynamicRange.SDR);
            List<String> supported = new ArrayList<>();
            for (String quality : QUALITY_ORDER) if (available.contains(cameraQuality(quality))) supported.add(quality);
            if (supported.isEmpty()) return;
            supportedQualities.clear();
            supportedQualities.addAll(supported);
        } catch (Exception error) {
            Log.w("7BRecording", "Unable to read supported recording qualities", error);
            ErrorLog.record(this, "recording", "無法讀取錄影畫質", error);
        }
    }

    private String selectedQuality() {
        int start = QUALITY_ORDER.indexOf(savedQuality());
        for (int index = start; index < QUALITY_ORDER.size(); index++) {
            if (supportedQualities.contains(QUALITY_ORDER.get(index))) return QUALITY_ORDER.get(index);
        }
        return supportedQualities.get(0);
    }

    private String nextQuality(String quality) {
        int index = supportedQualities.indexOf(quality);
        return supportedQualities.get((index + 1) % supportedQualities.size());
    }

    private void cycleQuality() {
        if (qualityRestartRequested || closing || cameraProvider == null) return;
        String current = selectedQuality(), next = nextQuality(current);
        if (next.equals(current)) return;
        getSharedPreferences(QUALITY_PREFS, MODE_PRIVATE).edit().putString(QUALITY_KEY, next).apply();
        qualityButton.setText(qualityLabel(next));
        if (recording == null) {
            if (!rebindSelectedQuality()) status.setText("相機啟動失敗");
            else startRecordingIfVisible();
            return;
        }
        qualityRestartRequested = true;
        status.setText("正在切換畫質…");
        recording.stop();
    }

    private boolean rebindSelectedQuality() {
        if (cameraProvider == null) return false;
        for (String quality : QUALITY_ORDER.subList(QUALITY_ORDER.indexOf(selectedQuality()), QUALITY_ORDER.size())) {
            if (!bindRecording(cameraProvider, cameraQuality(quality))) continue;
            qualityButton.setText(qualityLabel(quality));
            return true;
        }
        return false;
    }

    private String savedQuality() {
        String quality = getSharedPreferences(QUALITY_PREFS, MODE_PRIVATE).getString(QUALITY_KEY, "uhd");
        if ("fhd".equals(quality) || "hd".equals(quality)) return quality;
        return "uhd";
    }

    private static String qualityLabel(String quality) {
        if ("fhd".equals(quality)) return "1080p";
        if ("hd".equals(quality)) return "720p";
        return "4K";
    }

    private static Quality cameraQuality(String quality) {
        if ("fhd".equals(quality)) return Quality.FHD;
        if ("hd".equals(quality)) return Quality.HD;
        return Quality.UHD;
    }

    private static int videoBitrate(Quality quality) {
        if (quality == Quality.UHD) return 40_000_000;
        if (quality == Quality.HD) return 10_000_000;
        return 20_000_000;
    }

    private static Size previewSize(Quality quality) {
        if (quality == Quality.HD) return new Size(1280, 720);
        return new Size(1920, 1080);
    }

    private boolean bindRecording(ProcessCameraProvider provider, Quality quality) {
        try {
            int targetRotation = Surface.ROTATION_90;
            Preview.Builder previewBuilder = new Preview.Builder().setTargetRotation(targetRotation);
            if (quality != Quality.UHD) {
                previewBuilder.setResolutionSelector(new ResolutionSelector.Builder()
                        .setResolutionStrategy(new ResolutionStrategy(
                                previewSize(quality),
                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                        .build());
            }
            Preview preview = previewBuilder.build();
            preview.setSurfaceProvider(previewView.getSurfaceProvider());
            FallbackStrategy fallback = quality == Quality.UHD
                    ? FallbackStrategy.lowerQualityOrHigherThan(Quality.UHD)
                    : FallbackStrategy.lowerQualityThan(quality);
            QualitySelector qualitySelector = QualitySelector.from(quality, fallback);
            Recorder recorder = new Recorder.Builder()
                    .setQualitySelector(qualitySelector)
                    .setTargetVideoEncodingBitRate(videoBitrate(quality))
                    .setExecutor(recordingExecutor)
                    .build();
            videoCapture = new VideoCapture.Builder<>(recorder).setTargetRotation(targetRotation).build();
            provider.unbindAll();
            UseCaseGroup.Builder groupBuilder = new UseCaseGroup.Builder()
                    .addUseCase(preview)
                    .addUseCase(videoCapture);
            if (scoreOverlayEffect != null) groupBuilder.addEffect(scoreOverlayEffect);
            Camera camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, groupBuilder.build());
            applyContrastCurve(camera);
            return true;
        } catch (Exception error) {
            Log.w("7BRecording", "Unable to start recording at " + quality, error);
            ErrorLog.record(this, "recording", "無法開始錄影 " + quality, error);
            videoCapture = null;
            try { provider.unbindAll(); } catch (Exception ignored) {}
            return false;
        }
    }

    /** Stock video tonemapping leaves gym footage grey; phones without manual curves keep their default look. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private static void applyContrastCurve(Camera camera) {
        try {
            Camera2CameraInfo info = Camera2CameraInfo.from(camera.getCameraInfo());
            int[] modes = info.getCameraCharacteristic(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES);
            Integer maxPoints = info.getCameraCharacteristic(CameraCharacteristics.TONEMAP_MAX_CURVE_POINTS);
            if (modes == null || maxPoints == null || maxPoints < RecordingToneCurve.POINTS) return;
            boolean supportsCurve = false;
            for (int mode : modes) supportsCurve |= mode == CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE;
            if (!supportsCurve) return;
            float[] curve = RecordingToneCurve.points();
            Camera2CameraControl.from(camera.getCameraControl()).setCaptureRequestOptions(
                    new CaptureRequestOptions.Builder()
                            .setCaptureRequestOption(CaptureRequest.TONEMAP_MODE, CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE)
                            .setCaptureRequestOption(CaptureRequest.TONEMAP_CURVE, new TonemapCurve(curve, curve, curve))
                            .build());
        } catch (RuntimeException error) {
            Log.w("7BRecording", "Unable to apply recording contrast curve", error);
            ErrorLog.record(null, "recording", "無法套用錄影對比", error);
        }
    }

    private OverlayEffect createScoreOverlayEffect() {
        OverlayEffect effect = new OverlayEffect(
                CameraEffect.VIDEO_CAPTURE,
                0,
                overlayHandler,
                error -> {
                    Log.e("7BRecording", "Score overlay failed", error);
                    ErrorLog.record(this, "recording", "比分疊加失敗", error);
                }
        );
        effect.setOnDrawListener(frame -> {
            drawScoreOverlay(frame.getOverlayCanvas(), frame.getCropRect(), frame.getRotationDegrees(), overlayState.get());
            return true;
        });
        return effect;
    }

    private void drawScoreOverlay(android.graphics.Canvas canvas, Rect cropRect, int rotationDegrees, LiveMatchOverlayController.OverlayState match) {
        canvas.drawColor(Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR);
        if (match == null || !match.active) return;
        float width = cropRect.width(), height = cropRect.height();
        float viewportLeft = cropRect.left, viewportTop = cropRect.top;
        float targetAspect = 16f / 9f;
        if (width / height < targetAspect) {
            float viewportHeight = width / targetAspect;
            viewportTop += (height - viewportHeight) / 2f;
            height = viewportHeight;
        } else if (width / height > targetAspect) {
            float viewportWidth = height * targetAspect;
            viewportLeft += (width - viewportWidth) / 2f;
            width = viewportWidth;
        }
        drawScoreBoard(canvas, viewportLeft, viewportTop, width, height, match);
    }

    /** Uploads wait while the recording screen is open, including between files of 保存並繼續. */
    static boolean isRecordingSessionOpen() {
        return OPEN_SESSIONS.get() > 0;
    }

    private void bindBroadcastScoreSource() {
        liveMatchOverlay = new LiveMatchOverlayController(this, this::updateScoreOverlay);
    }

    private void updateScoreOverlay(LiveMatchOverlayController.OverlayState match) {
        overlayState.set(match);
        if (scorePreviewOverlay != null) scorePreviewOverlay.postInvalidate();
    }

    private void drawScoreBoard(android.graphics.Canvas canvas, float viewportLeft, float viewportTop, float width, float height, LiveMatchOverlayController.OverlayState match) {
        if (match == null || !match.active || width <= 0f || height <= 0f) return;
        int save = canvas.save();
        canvas.translate(viewportLeft, viewportTop);
        float margin = Math.max(12f, width * 0.012f);
        float boardWidth = Math.min(width * 0.28f, height * 0.64f);
        float rowHeight = Math.max(38f, height * 0.052f);
        RectF box = new RectF(margin, margin, margin + boardWidth, margin + rowHeight * 2f);

        Paint teamABackground = new Paint(Paint.ANTI_ALIAS_FLAG);
        teamABackground.setShader(new LinearGradient(box.left, box.top, box.right, box.top,
                0xFF0057D9, 0xFF00A9C7, Shader.TileMode.CLAMP));
        Paint teamBBackground = new Paint(Paint.ANTI_ALIAS_FLAG);
        teamBBackground.setShader(new LinearGradient(box.left, box.top, box.right, box.top,
                0xFFD91E45, 0xFFFF7A00, Shader.TileMode.CLAMP));
        canvas.drawRect(box.left, box.top, box.right, box.top + rowHeight, teamABackground);
        canvas.drawRect(box.left, box.top + rowHeight, box.right, box.bottom, teamBBackground);

        Paint teamAAccent = new Paint(Paint.ANTI_ALIAS_FLAG);
        teamAAccent.setColor(0xFF67E8F9);
        Paint teamBAccent = new Paint(Paint.ANTI_ALIAS_FLAG);
        teamBAccent.setColor(0xFFFFD166);
        float accentWidth = Math.max(8f, boardWidth * 0.028f);
        canvas.drawRect(box.left, box.top, box.left + accentWidth, box.top + rowHeight, teamAAccent);
        canvas.drawRect(box.left, box.top + rowHeight, box.left + accentWidth, box.bottom, teamBAccent);

        Paint divider = new Paint(Paint.ANTI_ALIAS_FLAG);
        divider.setColor(0x66FFFFFF);
        divider.setStrokeWidth(Math.max(2f, height * 0.002f));
        canvas.drawLine(box.left + accentWidth, box.top + rowHeight, box.right, box.top + rowHeight, divider);

        float scoreWidth = Math.max(56f, boardWidth * 0.18f);
        Paint scoreBackground = new Paint(Paint.ANTI_ALIAS_FLAG);
        scoreBackground.setColor(0xFFF7F8FA);
        canvas.drawRect(box.right - scoreWidth, box.top, box.right, box.top + rowHeight, scoreBackground);
        canvas.drawRect(box.right - scoreWidth, box.top + rowHeight, box.right, box.bottom, scoreBackground);

        Paint names = new Paint(Paint.ANTI_ALIAS_FLAG);
        names.setColor(Color.WHITE);
        names.setFakeBoldText(true);
        names.setTextSize(Math.max(23f, rowHeight * 0.56f));
        names.setTextAlign(Paint.Align.LEFT);
        Paint scores = new Paint(Paint.ANTI_ALIAS_FLAG);
        scores.setColor(0xFF10131A);
        scores.setFakeBoldText(true);
        scores.setTextSize(Math.max(30f, rowHeight * 0.76f));
        scores.setTextAlign(Paint.Align.CENTER);

        float nameLeft = box.left + accentWidth + Math.max(11f, boardWidth * 0.035f);
        float nameMaxWidth = box.right - scoreWidth - nameLeft - Math.max(8f, boardWidth * 0.025f);
        float firstBaseline = box.top + rowHeight * 0.67f;
        float secondBaseline = firstBaseline + rowHeight;
        canvas.drawText(fitTeamLabel(match.teamA, names, nameMaxWidth), nameLeft, firstBaseline, names);
        canvas.drawText(fitTeamLabel(match.teamB, names, nameMaxWidth), nameLeft, secondBaseline, names);
        canvas.drawText(String.valueOf(match.scoreA), box.right - scoreWidth / 2f, firstBaseline + rowHeight * 0.05f, scores);
        canvas.drawText(String.valueOf(match.scoreB), box.right - scoreWidth / 2f, secondBaseline + rowHeight * 0.05f, scores);
        canvas.restoreToCount(save);
    }

    private static String fitTeamLabel(List<String> players, Paint paint, float maxWidth) {
        String label = teamLabel(players);
        if (paint.measureText(label) <= maxWidth) return label;
        return android.text.TextUtils.ellipsize(label, new android.text.TextPaint(paint), maxWidth, android.text.TextUtils.TruncateAt.END).toString();
    }

    private static String teamLabel(List<String> players) {
        if (players == null || players.isEmpty()) return "球員";
        return android.text.TextUtils.join("・", players);
    }

    private void startBroadcastRecording() {
        if (closing || recording != null || videoCapture == null) return;
        long capturedAt = System.currentTimeMillis();
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.TAIWAN).format(new Date(capturedAt));
        String displayName = "7B-轉播-" + stamp + ".mp4";
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, displayName);
        values.put(MediaStore.Video.Media.TITLE, "7B-轉播-" + stamp);
        values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        values.put(MediaStore.Video.Media.DATE_TAKEN, capturedAt);
        values.put(MediaStore.Video.Media.DATE_ADDED, capturedAt / 1000L);
        values.put(MediaStore.Video.Media.DATE_MODIFIED, capturedAt / 1000L);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Video.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_MOVIES + "/7B控制台/比賽轉播");
        } else {
            File outputDirectory = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
                    "7B控制台/比賽轉播");
            if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
                status.setText("無法建立影片資料夾");
                return;
            }
            values.put(MediaStore.Video.Media.DATA, new File(outputDirectory, displayName).getAbsolutePath());
        }
        try {
            MediaStoreOutputOptions output = new MediaStoreOutputOptions.Builder(
                    getContentResolver(), MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
                    .setContentValues(values)
                    .build();
            PendingRecording pending = videoCapture.getOutput().prepareRecording(this, output);
            if (hasPermission(Manifest.permission.RECORD_AUDIO)) pending = pending.withAudioEnabled();
            recording = pending.start(ContextCompat.getMainExecutor(this), this::onVideoEvent);
            status.setText("● 比分轉播錄影中");
        } catch (RuntimeException error) {
            Log.w("7BRecording", "Broadcast recording start interrupted", error);
            ErrorLog.record(this, "recording", "轉播錄影啟動中斷", error);
            recording = null;
            status.setText("正在恢復錄影…");
            scheduleRecordingRecovery();
        }
    }

    private void startRecordingIfVisible() {
        handler.removeCallbacks(recoverRecording);
        if (closing || isFinishing() || isDestroyed()) return;
        if (!getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) return;
        startBroadcastRecording();
    }

    private void scheduleRecordingRecovery() {
        handler.removeCallbacks(recoverRecording);
        if (!closing) handler.postDelayed(recoverRecording, RECORDING_RECOVERY_MS);
    }

    private void onVideoEvent(@NonNull VideoRecordEvent event) {
        if (event instanceof VideoRecordEvent.Start) {
            broadcastFileStartedAt = System.currentTimeMillis();
            pauses.clear();
            if (broadcastStartReported) return;
            broadcastStartReported = true;
            if (remoteScoreController == null) remoteScoreController = new BackgroundScoreController(this);
            remoteScoreController.markBroadcastRecordingStarted(System.currentTimeMillis(), (success, message) -> {
                if (!success) {
                    Log.w("7BRecording", "Could not publish recording start: " + message);
                    ErrorLog.record(this, "recording", "錄影開始時間未送出 " + message, null);
                }
            });
            return;
        }
        if (event instanceof VideoRecordEvent.Pause) {
            paused = true;
            pauseStartedAt = System.currentTimeMillis();
            pauseButton.setText("繼續");
            status.setText("已暫停");
            return;
        }
        if (event instanceof VideoRecordEvent.Resume) {
            closePause();
            status.setText("● 比分轉播錄影中");
            return;
        }
        if (!(event instanceof VideoRecordEvent.Finalize)) return;
        VideoRecordEvent.Finalize finalized = (VideoRecordEvent.Finalize) event;
        recording = null;
        closePause();
        List<long[]> filePauses = new ArrayList<>(pauses);
        pauses.clear();
        android.net.Uri savedUri = finalized.getOutputResults().getOutputUri();
        if (abandonRecording) {
            if (savedUri != null && !android.net.Uri.EMPTY.equals(savedUri)) {
                try { getContentResolver().delete(savedUri, null, null); } catch (RuntimeException ignored) { }
            }
            closing = true;
            finish();
            return;
        }
        boolean success = !finalized.hasError() && savedUri != null && !android.net.Uri.EMPTY.equals(savedUri);
        long fileStartedAt = broadcastFileStartedAt;
        long fileEndedAt = System.currentTimeMillis();
        if (success) queueSavedRecording(savedUri, fileStartedAt, fileEndedAt, filePauses);
        broadcastFileStartedAt = 0L;
        if (qualityRestartRequested) {
            qualityRestartRequested = false;
            if (!rebindSelectedQuality()) {
                status.setText("相機啟動失敗");
                return;
            }
            status.setText("正在繼續錄影…");
            scheduleRecordingRecovery();
            return;
        }
        if (broadcastExitRequested) {
            RemoteSessionStore.setRecordingEnabled(this, false);
            Toast.makeText(this, success ? "比分轉播影片已保存" : "影片保存失敗", Toast.LENGTH_LONG).show();
            closing = true;
            finish();
        } else if (broadcastSaveRequested) {
            broadcastSaveRequested = false;
            Toast.makeText(this, success ? "影片已保存，繼續錄影" : "影片保存失敗，正在繼續錄影", Toast.LENGTH_SHORT).show();
            status.setText("正在繼續錄影…");
            scheduleRecordingRecovery();
        } else if (!closing) {
            status.setText(success ? "錄影中斷，正在建立新檔…" : "正在恢復錄影…");
            scheduleRecordingRecovery();
        }
    }

    private void queueSavedRecording(android.net.Uri savedUri, long startedAt, long endedAt,
            List<long[]> filePauses) {
        android.content.Context app = getApplicationContext();
        String roomId = RemoteSessionStore.getSession(app).roomId;
        savedRecordingExecutor.execute(() -> {
            alignAudioClock(app, savedUri);
            RecordingUploadStore.add(app, savedUri, roomId, startedAt, endedAt, filePauses);
        });
    }

    private static void alignAudioClock(android.content.Context app, android.net.Uri savedUri) {
        try {
            if (!AudioClockAligner.align(app.getContentResolver(), savedUri)) return;
        } catch (Exception error) {
            Log.w("7BRecording", "Unable to align recording audio clock", error);
            ErrorLog.record(app, "recording", "影音同步校正失敗", error);
            return;
        }
        try (android.os.ParcelFileDescriptor descriptor = app.getContentResolver().openFileDescriptor(savedUri, "r")) {
            if (descriptor == null) return;
            ContentValues size = new ContentValues();
            size.put(MediaStore.Video.Media.SIZE, descriptor.getStatSize());
            app.getContentResolver().update(savedUri, size, null, null);
        } catch (Exception ignored) { }
    }

    private void returnWithoutAction() {
        if (abandonRecording || closing) return;
        abandonRecording = true;
        closing = true;
        handler.removeCallbacks(recoverRecording);
        if (recording != null) {
            status.setText("返回中…");
            recording.stop();
            return;
        }
        finish();
    }

    private void exitRecording() {
        explicitExit = true;
        if (recording != null) {
            broadcastExitRequested = true;
            status.setText("正在完成並保存影片…");
            recording.stop();
            return;
        }
        closing = true;
        RemoteSessionStore.setRecordingEnabled(this, false);
        finish();
    }

    private void togglePause() {
        if (recording == null || qualityRestartRequested || broadcastSaveRequested || broadcastExitRequested) return;
        if (paused) recording.resume();
        else recording.pause();
    }

    private void closePause() {
        if (paused) pauses.add(new long[] {pauseStartedAt, System.currentTimeMillis()});
        paused = false;
        if (pauseButton != null) pauseButton.setText("暫停");
    }

    private void saveBroadcastAndContinue() {
        if (broadcastSaveRequested || broadcastExitRequested) return;
        if (recording == null) {
            Toast.makeText(this, "錄影正在準備中", Toast.LENGTH_SHORT).show();
            return;
        }
        broadcastSaveRequested = true;
        status.setText("正在保存影片…");
        recording.stop();
    }

    @Override public void onBackPressed() {
        returnWithoutAction();
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

    @Override protected void onDestroy() {
        closing = true; handler.removeCallbacks(recoverRecording); cancelRecordingCameraLongPress(); if (recording != null) recording.stop();
        if (liveMatchOverlay != null) liveMatchOverlay.close();
        if (remoteScoreController != null) remoteScoreController.release();
        if (scoreOverlayEffect != null) scoreOverlayEffect.close();
        overlayThread.quitSafely();
        if (explicitExit) RemoteSessionStore.setRecordingEnabled(this, false);
        if (sessionCounted) {
            sessionCounted = false;
            OPEN_SESSIONS.decrementAndGet();
        }
        recordingExecutor.shutdown();
        android.content.Context app = getApplicationContext();
        savedRecordingExecutor.execute(() -> YouTubeUploadScheduler.scheduleIfPending(app));
        savedRecordingExecutor.shutdown();
        super.onDestroy();
    }
}
