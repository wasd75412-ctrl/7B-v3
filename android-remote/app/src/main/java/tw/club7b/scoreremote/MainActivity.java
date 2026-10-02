package tw.club7b.scoreremote;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "frolicking-taffy-4c3e5b.netlify.app";
    private static final String APP_URL = "https://" + APP_HOST + "/?androidRemote=1";
    private static final long MISSING_KEY_UP_DELAY_MS = 160L;
    private static final long SAME_POINT_ECHO_MS = 40L;
    private static final long UNDO_DEBOUNCE_MS = 600L;
    private static final long SHUTTLE_PRESS_COOLDOWN_MS = 2000L;
    private static final long CAMERA_PRECONNECT_TIMEOUT_MS = 5000L;

    private final VolumeKeyInterpreter volumeKeys = new VolumeKeyInterpreter();
    private final YuntengGestureInterpreter yuntengGestures = new YuntengGestureInterpreter();
    private final P4GestureInterpreter p4Gestures = new P4GestureInterpreter();
    private Runnable pendingP4Settle;
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private final RemoteKeyRelay.Listener remoteKeyListener = this::handleRemoteKeyEvent;
    private WebView webView;
    private Runnable pendingLongPress;
    private Runnable pendingKeyFallback;
    private Runnable pendingYuntengPress;
    private long lastShuttleActionAt;
    private long lastPointActionAt;
    private VolumeKeyInterpreter.Action lastPointAction = VolumeKeyInterpreter.Action.NONE;
    private long lastUndoActionAt;
    private volatile boolean activityStarted;
    private boolean activityResumed;
    private volatile boolean recordingModeEnabled;
    private BackgroundScoreController backgroundScoreController;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        recordingModeEnabled = RemoteSessionStore.isRecordingEnabled(this);
        YouTubeUploadScheduler.scheduleIfPending(this);

        createWebView();
    }

    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(6, 25, 38));
        configureWebView(webView);
        setContentView(webView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.loadUrl(APP_URL);
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " 7BAndroidRemote/1.3.42");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);
        view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        view.addJavascriptInterface(new AndroidBridge(), "BcmAndroid");
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView failedView, RenderProcessGoneDetail detail) {
                Log.w("7BRemote", "WebView renderer stopped; crashed=" + detail.didCrash());
                if (failedView == webView) webView = null;
                if (failedView.getParent() instanceof ViewGroup) {
                    ((ViewGroup) failedView.getParent()).removeView(failedView);
                }
                failedView.destroy();
                // The camera owns its own Activity and can continue without a hidden webpage.
                if (activityResumed && !isFinishing() && !isDestroyed()) createWebView();
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "無法開啟連結", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        view.requestFocus();
    }

    @Override
    protected void onStart() {
        super.onStart();
        activityStarted = true;
        RemoteKeyRelay.setListener(remoteKeyListener);
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityResumed = true;
        scoreController().warmUp((success, message) -> { });
        if (webView == null) createWebView();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
        notifyKeyAccessChanged();
    }

    @Override
    protected void onPause() {
        activityResumed = false;
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onStop() {
        activityStarted = false;
        // The native camera and Firestore controller keep recording and scoring alive. The hidden
        // WebView must stay suspended or Samsung may kill the whole app for background CPU usage.
        RemoteKeyRelay.clearListener(remoteKeyListener);
        super.onStop();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (handleRemoteKeyEvent(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        if (deliverP4Gesture(event)) return true;
        if (!yuntengGestures.isYuntengEvent(event)) return super.dispatchTouchEvent(event);
        boolean officialStart = scoreController().allowsFastOfficialStartPress();
        if (!yuntengGestures.onTouchEvent(event, officialStart)) return true;
        if (officialStart) {
            deliverYuntengPress(yuntengGestures.onSettledPress());
            return true;
        }
        cancelYuntengPressTimers();
        scheduleYuntengPress();
        return true;
    }

    private void scheduleYuntengPress() {
        if (pendingYuntengPress != null) keyHandler.removeCallbacks(pendingYuntengPress);
        pendingYuntengPress = () -> {
            pendingYuntengPress = null;
            deliverYuntengPress(yuntengGestures.onSettledPress());
        };
        keyHandler.postDelayed(pendingYuntengPress, YuntengGestureInterpreter.GESTURE_SETTLE_MS);
    }

    private void deliverYuntengPress(VolumeKeyInterpreter.Action action) {
        if (action == VolumeKeyInterpreter.Action.NONE) return;
        notifyKeyDetected(action == VolumeKeyInterpreter.Action.TEAM_A_PLUS
                ? KeyEvent.KEYCODE_VOLUME_UP : KeyEvent.KEYCODE_VOLUME_DOWN);
        sendYuntengScoreAction(action);
    }

    private void cancelYuntengPressTimers() {
        if (pendingYuntengPress == null) return;
        keyHandler.removeCallbacks(pendingYuntengPress);
        pendingYuntengPress = null;
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        if (deliverP4Gesture(event)) return true;
        return super.dispatchGenericMotionEvent(event);
    }

    private boolean deliverP4Gesture(MotionEvent event) {
        if (!p4Gestures.isP4Event(event)) return false;
        p4Gestures.setDisplayRotation(getWindowManager().getDefaultDisplay().getRotation());
        VolumeKeyInterpreter.Action action = p4Gestures.onTouchEvent(event, displayDensity());
        if (action != VolumeKeyInterpreter.Action.NONE) {
            cancelP4Settle();
            deliverP4Action(action);
        } else if (p4Gestures.isTracking()) {
            scheduleP4Settle();
        }
        return true;
    }

    private void scheduleP4Settle() {
        cancelP4Settle();
        pendingP4Settle = () -> {
            pendingP4Settle = null;
            VolumeKeyInterpreter.Action action = p4Gestures.finishTracking(SystemClock.uptimeMillis());
            if (action == VolumeKeyInterpreter.Action.NONE) return;
            deliverP4Action(action);
        };
        keyHandler.postDelayed(pendingP4Settle, 120L);
    }

    private void cancelP4Settle() {
        if (pendingP4Settle == null) return;
        keyHandler.removeCallbacks(pendingP4Settle);
        pendingP4Settle = null;
    }

    private float displayDensity() {
        return getResources().getDisplayMetrics().density;
    }

    private void deliverP4Action(VolumeKeyInterpreter.Action action) {
        BackgroundScoreController.Callback callback = (success, message, completedAction) -> keyHandler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? 55L : 28L);
        });
        switch (action) {
            case USE_SHUTTLE:
                sendRemoteUseShuttleCommand();
                return;
            case RETURN_SHUTTLE:
                sendRemoteReturnShuttleCommand();
                return;
            case TEAM_A_PLUS:
            case TEAM_B_PLUS:
            case UNDO:
                scoreController().submitDirect(action, callback);
                return;
            default:
                return;
        }
    }

    private boolean handleRemoteKeyEvent(KeyEvent event) {
        if (consumeP4Key(event)) return true;
        int keyCode = YuntengGestureInterpreter.remapKeyCode(event);
        if (!VolumeKeyInterpreter.isSupportedRemoteKey(keyCode)) return false;
        VolumeKeyInterpreter.Action action = VolumeKeyInterpreter.Action.NONE;
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getRepeatCount() == 0) {
                VolumeKeyInterpreter.Action previousAction = volumeKeys.onMissingKeyUp(keyCode);
                if (previousAction != VolumeKeyInterpreter.Action.NONE) {
                    handleResolvedRemoteAction(previousAction, keyCode, event.getEventTime());
                }
            }
            action = volumeKeys.onKeyDown(keyCode, event.getEventTime(), event.getRepeatCount());
            if (event.getRepeatCount() == 0) {
                notifyKeyDetected(keyCode);
                scheduleLongPress(keyCode, event.getEventTime());
                if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                    scheduleMissingKeyUpFallback(keyCode);
                }
            }
            if (action == VolumeKeyInterpreter.Action.UNDO || action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
                cancelLongPress();
                cancelMissingKeyUpFallback();
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            cancelLongPress();
            cancelMissingKeyUpFallback();
            action = volumeKeys.onKeyUp(keyCode, event.getEventTime());
        }
        if (action != VolumeKeyInterpreter.Action.NONE) handleResolvedRemoteAction(action, keyCode, event.getEventTime());
        return true;
    }

    private void scheduleLongPress(int keyCode, long pressedAt) {
        cancelLongPress();
        pendingLongPress = () -> {
            pendingLongPress = null;
            VolumeKeyInterpreter.Action action = volumeKeys.onLongPressTimeout(
                    keyCode,
                    pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS
            );
            if (action == VolumeKeyInterpreter.Action.NONE) return;
            cancelMissingKeyUpFallback();
            handleResolvedRemoteAction(action, keyCode, pressedAt + VolumeKeyInterpreter.LONG_PRESS_MS);
        };
        keyHandler.postDelayed(pendingLongPress, VolumeKeyInterpreter.LONG_PRESS_MS);
    }

    private void cancelLongPress() {
        if (pendingLongPress == null) return;
        keyHandler.removeCallbacks(pendingLongPress);
        pendingLongPress = null;
    }

    private void scheduleMissingKeyUpFallback(int keyCode) {
        cancelMissingKeyUpFallback();
        pendingKeyFallback = () -> {
            pendingKeyFallback = null;
            VolumeKeyInterpreter.Action action = volumeKeys.onMissingKeyUp(keyCode);
            if (action != VolumeKeyInterpreter.Action.NONE) handleResolvedRemoteAction(action, keyCode, SystemClock.uptimeMillis());
        };
        keyHandler.postDelayed(pendingKeyFallback, MISSING_KEY_UP_DELAY_MS);
    }

    private void cancelMissingKeyUpFallback() {
        if (pendingKeyFallback == null) return;
        keyHandler.removeCallbacks(pendingKeyFallback);
        pendingKeyFallback = null;
    }

    private void handleResolvedRemoteAction(VolumeKeyInterpreter.Action action, int keyCode, long eventTime) {
        if (keyCode == KeyEvent.KEYCODE_CAMERA && action == VolumeKeyInterpreter.Action.USE_SHUTTLE) {
            CameraButtonGesture.shared().onShortPress(eventTime, cameraButtonCallbacks);
            return;
        }
        if (keyCode == KeyEvent.KEYCODE_CAMERA && action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
            CameraButtonGesture.shared().onLongPress(eventTime, cameraButtonCallbacks);
            return;
        }
        if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE || action == VolumeKeyInterpreter.Action.RETURN_SHUTTLE) {
            long now = SystemClock.uptimeMillis();
            if (now - lastShuttleActionAt < SHUTTLE_PRESS_COOLDOWN_MS) return;
            lastShuttleActionAt = now;
            if (action == VolumeKeyInterpreter.Action.USE_SHUTTLE) sendRemoteUseShuttleCommand();
            else sendRemoteReturnShuttleCommand();
            return;
        }
        sendRemoteAction(action);
    }

    private final CameraButtonGesture.Callbacks cameraButtonCallbacks = new CameraButtonGesture.Callbacks() {
        @Override public void undo() { sendRemoteAction(VolumeKeyInterpreter.Action.UNDO); }
        @Override public void useShuttle() { sendRemoteUseShuttleCommand(); }
        @Override public void returnShuttle() { sendRemoteReturnShuttleCommand(); }
    };

    private void sendRemoteUseShuttleCommand() {
        scoreController().useOneShuttle((success, message) -> keyHandler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? 120L : 28L);
        }));
    }

    private void sendRemoteReturnShuttleCommand() {
        scoreController().returnOneShuttle((success, message) -> keyHandler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? 120L : 28L);
        }));
    }

    private BackgroundScoreController scoreController() {
        if (backgroundScoreController == null) backgroundScoreController = new BackgroundScoreController(this);
        return backgroundScoreController;
    }

    private void sendYuntengScoreAction(VolumeKeyInterpreter.Action action) {
        scoreController().submit(action, (success, message, completedAction) -> keyHandler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? 55L : 28L);
        }));
    }

    private boolean consumeP4Key(KeyEvent event) {
        if (event == null || event.getDevice() == null
                || !P4GestureInterpreter.isP4Name(event.getDevice().getName())) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0
                && P4GestureInterpreter.isOfficialStartKey(event.getDevice().getName(), event.getKeyCode())) {
            sendRemoteOfficialStartCommand();
        }
        return true;
    }

    private void sendRemoteOfficialStartCommand() {
        if (backgroundScoreController == null) {
            backgroundScoreController = new BackgroundScoreController(this);
        }
        backgroundScoreController.startOfficialMatch((success, message) -> keyHandler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            vibrate(success ? 70L : 28L);
        }));
    }

    private void notifyKeyDetected(int keyCode) {
        if (webView == null) return;
        String label = VolumeKeyInterpreter.keyLabel(keyCode);
        evaluateJavascript(
                "window.bcmAndroidRemoteKeyDetected&&window.bcmAndroidRemoteKeyDetected('" + label + "')",
                null
        );
    }

    private void sendRemoteAction(VolumeKeyInterpreter.Action action) {
        if (webView == null) return;
        long now = SystemClock.uptimeMillis();
        if (action == VolumeKeyInterpreter.Action.UNDO) {
            if (now - lastUndoActionAt < UNDO_DEBOUNCE_MS) return;
            lastUndoActionAt = now;
        } else if (action == VolumeKeyInterpreter.Action.TEAM_A_PLUS || action == VolumeKeyInterpreter.Action.TEAM_B_PLUS) {
            if (action == lastPointAction && now - lastPointActionAt < SAME_POINT_ECHO_MS) return;
            lastPointAction = action;
            lastPointActionAt = now;
        }
        if (action == VolumeKeyInterpreter.Action.TEAM_A_PLUS || action == VolumeKeyInterpreter.Action.TEAM_B_PLUS) {
            sendYuntengScoreAction(action);
            return;
        }
        String command;
        String successMessage;
        switch (action) {
            case TEAM_A_PLUS:
                command = "teamAPlus";
                successMessage = "A隊 ＋1";
                break;
            case TEAM_B_PLUS:
                command = "teamBPlus";
                successMessage = "B隊 ＋1";
                break;
            case UNDO:
                command = "undo";
                successMessage = "已撤銷上一分";
                break;
            default:
                return;
        }
        evaluateJavascript(
                "(function(){return !!(window.bcmAndroidRemoteInput&&window.bcmAndroidRemoteInput('" + command + "'));})()",
                result -> {
                    boolean accepted = "true".equals(result);
                    Toast.makeText(
                            MainActivity.this,
                            accepted ? successMessage : "請確認已連接球局、登入管理員並開始比賽",
                            Toast.LENGTH_SHORT
                    ).show();
                    vibrate(accepted ? (action == VolumeKeyInterpreter.Action.UNDO ? 90L : 45L) : 25L);
                }
        );
    }

    private boolean isRemoteKeyAccessEnabled() {
        AccessibilityManager manager = (AccessibilityManager) getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null || !manager.isEnabled()) return false;
        ComponentName expected = new ComponentName(this, RemoteKeyAccessibilityService.class);
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            ComponentName enabled = ComponentName.unflattenFromString(info.getId());
            if (expected.equals(enabled)) return true;
        }
        return false;
    }

    private void openRemoteKeyAccessSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        } catch (Exception ignored) {
            Toast.makeText(this, "請到設定開啟無障礙服務", Toast.LENGTH_LONG).show();
        }
    }

    private void notifyKeyAccessChanged() {
        if (webView == null) return;
        evaluateJavascript(
                "window.bcmAndroidKeyAccessChanged&&window.bcmAndroidKeyAccessChanged()",
                null
        );
    }

    private void setRecordingModeEnabled(boolean enabled) {
        recordingModeEnabled = enabled;
        RemoteSessionStore.setRecordingEnabled(this, enabled);
        if (activityStarted) RemoteKeyRelay.setListener(remoteKeyListener);
        else RemoteKeyRelay.clearListener(remoteKeyListener);
        notifyRecordingModeChanged();
    }

    private void notifyRecordingModeChanged() {
        if (webView == null) return;
        evaluateJavascript(
                "window.bcmAndroidRecordingModeChanged&&window.bcmAndroidRecordingModeChanged()",
                null
        );
    }

    private void evaluateJavascript(String script, ValueCallback<String> callback) {
        WebView target = webView;
        if (target == null) return;
        target.post(() -> {
            if (target == webView) target.evaluateJavascript(script, callback);
        });
    }

    private void openBroadcastCamera() {
        openVideoCamera(true);
    }

    private void openVideoCamera(boolean broadcastMode) {
        Intent intent = new Intent(this, LoopCameraActivity.class);
        intent.putExtra(LoopCameraActivity.EXTRA_BROADCAST_MODE, broadcastMode);
        if (intent.resolveActivity(getPackageManager()) == null) {
            Toast.makeText(this, "找不到可用的錄影相機", Toast.LENGTH_LONG).show();
            return;
        }
        setRecordingModeEnabled(true);
        if (backgroundScoreController == null) {
            backgroundScoreController = new BackgroundScoreController(this);
        }

        Toast.makeText(this, "正在連接即時比分…", Toast.LENGTH_SHORT).show();
        AtomicBoolean cameraStarted = new AtomicBoolean(false);
        Runnable launchCamera = () -> {
            if (!cameraStarted.compareAndSet(false, true)) return;
            startActivity(intent);
        };
        Runnable timeout = () -> {
            if (cameraStarted.get()) return;
            Toast.makeText(this, "連線較慢，將在背景繼續同步", Toast.LENGTH_SHORT).show();
            launchCamera.run();
        };
        keyHandler.postDelayed(timeout, CAMERA_PRECONNECT_TIMEOUT_MS);
        backgroundScoreController.warmUp((success, message) -> keyHandler.post(() -> {
            if (cameraStarted.get()) return;
            keyHandler.removeCallbacks(timeout);
            Toast.makeText(
                    this,
                    success ? "比分已連線，開始轉播錄影" : message,
                    success ? Toast.LENGTH_SHORT : Toast.LENGTH_LONG
            ).show();
            launchCamera.run();
        }));
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public boolean isRemoteKeyAccessEnabled() {
            return MainActivity.this.isRemoteKeyAccessEnabled();
        }

        @JavascriptInterface
        public void openRemoteKeyAccessSettings() {
            runOnUiThread(MainActivity.this::openRemoteKeyAccessSettings);
        }

        @JavascriptInterface
        public boolean isRecordingModeEnabled() {
            return recordingModeEnabled;
        }

        @JavascriptInterface
        public void setRecordingModeEnabled(boolean enabled) {
            MainActivity.this.setRecordingModeEnabled(enabled);
        }

        @JavascriptInterface
        public void updateRemoteSession(
                String roomId,
                boolean hostAuthorized,
                boolean matchActive,
                int target,
                int cap,
                boolean deuce
        ) {
            RemoteSessionStore.updateSession(
                    MainActivity.this,
                    roomId,
                    hostAuthorized,
                    matchActive,
                    target,
                    cap,
                    deuce
            );
        }

        @JavascriptInterface
        public void openBroadcastCamera() {
            runOnUiThread(MainActivity.this::openBroadcastCamera);
        }

        @JavascriptInterface
        public void openRecordings() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, RecordingsActivity.class)));
        }
    }

    private void vibrate(long milliseconds) {
        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
            vibrator = manager == null ? null : manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        cancelLongPress();
        cancelMissingKeyUpFallback();
        cancelYuntengPressTimers();
        if (backgroundScoreController != null) backgroundScoreController.release();
        RemoteKeyRelay.clearListener(remoteKeyListener);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
