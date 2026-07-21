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
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "frolicking-taffy-4c3e5b.netlify.app";
    private static final String APP_URL = "https://" + APP_HOST + "/?androidRemote=1";
    private static final long MISSING_KEY_UP_DELAY_MS = 800L;
    private static final long ACTION_DEBOUNCE_MS = 240L;

    private final VolumeKeyInterpreter volumeKeys = new VolumeKeyInterpreter();
    private final Handler keyHandler = new Handler(Looper.getMainLooper());
    private final RemoteKeyRelay.Listener remoteKeyListener = this::handleRemoteKeyEvent;
    private WebView webView;
    private Runnable pendingLongPress;
    private Runnable pendingKeyFallback;
    private long lastActionAt;
    private volatile boolean activityStarted;
    private volatile boolean recordingModeEnabled;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

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
        settings.setUserAgentString(settings.getUserAgentString() + " 7BAndroidRemote/1.2.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true);
        view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        view.addJavascriptInterface(new AndroidBridge(), "BcmAndroid");
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
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
        notifyKeyAccessChanged();
    }

    @Override
    protected void onStop() {
        activityStarted = false;
        if (!recordingModeEnabled) RemoteKeyRelay.clearListener(remoteKeyListener);
        super.onStop();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (handleRemoteKeyEvent(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    private boolean handleRemoteKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (!VolumeKeyInterpreter.isSupportedRemoteKey(keyCode)) return false;
        VolumeKeyInterpreter.Action action = VolumeKeyInterpreter.Action.NONE;
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            action = volumeKeys.onKeyDown(keyCode, event.getEventTime(), event.getRepeatCount());
            if (event.getRepeatCount() == 0) {
                notifyKeyDetected(keyCode);
                scheduleLongPress(keyCode, event.getEventTime());
                scheduleMissingKeyUpFallback(keyCode);
            }
            if (action == VolumeKeyInterpreter.Action.UNDO) {
                cancelLongPress();
                cancelMissingKeyUpFallback();
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP) {
            cancelLongPress();
            cancelMissingKeyUpFallback();
            action = volumeKeys.onKeyUp(keyCode, event.getEventTime());
        }
        if (action != VolumeKeyInterpreter.Action.NONE) sendRemoteAction(action);
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
            sendRemoteAction(action);
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
            if (action != VolumeKeyInterpreter.Action.NONE) sendRemoteAction(action);
        };
        keyHandler.postDelayed(pendingKeyFallback, MISSING_KEY_UP_DELAY_MS);
    }

    private void cancelMissingKeyUpFallback() {
        if (pendingKeyFallback == null) return;
        keyHandler.removeCallbacks(pendingKeyFallback);
        pendingKeyFallback = null;
    }

    private void notifyKeyDetected(int keyCode) {
        if (webView == null) return;
        String label = VolumeKeyInterpreter.keyLabel(keyCode);
        webView.post(() -> webView.evaluateJavascript(
                "window.bcmAndroidRemoteKeyDetected&&window.bcmAndroidRemoteKeyDetected('" + label + "')",
                null
        ));
    }

    private void sendRemoteAction(VolumeKeyInterpreter.Action action) {
        if (webView == null) return;
        long now = SystemClock.uptimeMillis();
        if (now - lastActionAt < ACTION_DEBOUNCE_MS) return;
        lastActionAt = now;
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
        webView.post(() -> webView.evaluateJavascript(
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
        ));
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
        webView.post(() -> webView.evaluateJavascript(
                "window.bcmAndroidKeyAccessChanged&&window.bcmAndroidKeyAccessChanged()",
                null
        ));
    }

    private void setRecordingModeEnabled(boolean enabled) {
        recordingModeEnabled = enabled;
        if (enabled) RemoteKeyRelay.setListener(remoteKeyListener);
        else if (!activityStarted) RemoteKeyRelay.clearListener(remoteKeyListener);
        notifyRecordingModeChanged();
    }

    private void notifyRecordingModeChanged() {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.bcmAndroidRecordingModeChanged&&window.bcmAndroidRecordingModeChanged()",
                null
        ));
    }

    private void openVideoCamera() {
        setRecordingModeEnabled(true);
        Intent intent = new Intent(MediaStore.INTENT_ACTION_VIDEO_CAMERA);
        if (intent.resolveActivity(getPackageManager()) == null) {
            Toast.makeText(this, "找不到可用的錄影相機", Toast.LENGTH_LONG).show();
            return;
        }
        startActivity(intent);
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
        public void openVideoCamera() {
            runOnUiThread(MainActivity.this::openVideoCamera);
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
        RemoteKeyRelay.clearListener(remoteKeyListener);
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
