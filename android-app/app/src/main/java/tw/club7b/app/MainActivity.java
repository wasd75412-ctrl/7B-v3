package tw.club7b.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.OverScroller;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.ComponentActivity;

public final class MainActivity extends ComponentActivity {
    private static final String START_URL = "https://7b-v3.pages.dev/";
    private WebView webView;

    private final class NativeBridge {
        @JavascriptInterface public void openNotificationSetup(String url) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    intent.setPackage("com.android.chrome");
                    startActivity(intent);
                } catch (Exception ignored) {
                    intent.setPackage(null);
                    startActivity(intent);
                }
            });
        }
    }

    private static final class ScrollWebView extends WebView {
        private float lastY;
        private float downY;
        private boolean scrolling;
        private final int touchSlop;
        private final int maximumFlingVelocity;
        private final OverScroller scroller;
        private VelocityTracker velocityTracker;

        ScrollWebView(MainActivity context) {
            super(context);
            ViewConfiguration configuration = ViewConfiguration.get(context);
            touchSlop = configuration.getScaledTouchSlop();
            maximumFlingVelocity = configuration.getScaledMaximumFlingVelocity();
            scroller = new OverScroller(context);
        }

        @Override public boolean onTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                lastY = downY = event.getY();
                scrolling = false;
                if (velocityTracker != null) velocityTracker.recycle();
                velocityTracker = VelocityTracker.obtain();
                velocityTracker.addMovement(event);
            } else if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
                if (velocityTracker != null) velocityTracker.addMovement(event);
                float dy = lastY - event.getY();
                if (!scrolling && Math.abs(event.getY() - downY) > touchSlop) {
                    scrolling = true;
                    MotionEvent cancel = MotionEvent.obtain(event);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    super.onTouchEvent(cancel);
                    cancel.recycle();
                }
                if (scrolling) {
                    scrollBy(0, Math.round(dy * 1.25f));
                    lastY = event.getY();
                    return true;
                }
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                if (velocityTracker != null) velocityTracker.addMovement(event);
                if (scrolling) {
                    velocityTracker.computeCurrentVelocity(1000, maximumFlingVelocity);
                    int maxY = Math.max(0, computeVerticalScrollRange() - getHeight());
                    scroller.fling(0, getScrollY(), 0, Math.round(-velocityTracker.getYVelocity() * 1.35f), 0, 0, 0, maxY);
                    postInvalidateOnAnimation();
                    velocityTracker.recycle();
                    velocityTracker = null;
                    return true;
                }
                if (velocityTracker != null) {
                    velocityTracker.recycle();
                    velocityTracker = null;
                }
            } else if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                if (velocityTracker != null) {
                    velocityTracker.recycle();
                    velocityTracker = null;
                }
            }
            return super.onTouchEvent(event);
        }

        @Override public void computeScroll() {
            if (scroller.computeScrollOffset()) {
                scrollTo(scroller.getCurrX(), scroller.getCurrY());
                postInvalidateOnAnimation();
            } else {
                super.computeScroll();
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new ScrollWebView(this);
        webView.setBackgroundColor(Color.rgb(3, 21, 35));
        webView.addJavascriptInterface(new NativeBridge(), "BadmintonApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // 某些 Android WebView 會把網頁 body 視為固定高度，強制恢復原生垂直捲動。
                view.evaluateJavascript("(function(){var h=document.documentElement,b=document.body;[h,b].forEach(function(e){if(e){e.style.setProperty('height','auto','important');e.style.setProperty('min-height','100%','important');e.style.setProperty('overflow-y','scroll','important');e.style.setProperty('touch-action','pan-y','important');}});if(!('PushManager'in window)){var n=document.getElementById('pushNotificationBtn');if(n&&!n.dataset.nativePush){n.dataset.nativePush='1';n.disabled=false;n.textContent='🔔 用 Chrome 開啟通知';n.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();BadmintonApp.openNotificationSetup(location.href);},true);}}})();", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        webView.setVerticalScrollBarEnabled(true);
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        setContentView(webView);
        if (state == null) webView.loadUrl(START_URL);
        else webView.restoreState(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack(); else finish();
            }
        });
    }

    @Override protected void onSaveInstanceState(Bundle out) { webView.saveState(out); super.onSaveInstanceState(out); }
    @Override protected void onDestroy() { if (webView != null) webView.destroy(); super.onDestroy(); }
}
