package tw.club7b.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

public final class MainActivity extends ComponentActivity {
    private static final String START_URL = "https://7b-v3.pages.dev/";
    // Native scrollBy never moves Chromium's document, so consuming the drag left the page stuck.
    private static final String PAGE_READY_SCRIPT =
            "(function(){"
            + "var style=document.getElementById('android-club-scroll');"
            + "if(!style){"
            + "style=document.createElement('style');"
            + "style.id='android-club-scroll';"
            + "style.textContent='html.android-club-app,html.android-club-app body{height:auto!important;max-height:none!important;overflow:visible!important;overscroll-behavior:auto!important;touch-action:pan-y!important}"
            + "html.android-club-app body.player-modal-open,html.android-club-app body.next-event-modal-open{position:fixed!important;left:0!important;right:0!important;width:100%!important;overflow:hidden!important;overscroll-behavior:none!important}"
            + "html.android-club-app #app,html.android-club-app .shell,html.android-club-app #app .top,html.android-club-app #app .tabs,html.android-club-app #app .page{overflow:visible!important;max-height:none!important;touch-action:pan-y!important}"
            + "html.android-club-app .splash.hide{pointer-events:none!important;visibility:hidden!important}';"
            + "document.documentElement.appendChild(style);"
            + "}"
            + "document.documentElement.classList.add('android-club-app');"
            + "if(!('PushManager' in window)){"
            + "var button=document.getElementById('pushNotificationBtn');"
            + "if(button&&!button.dataset.nativePush){"
            + "button.dataset.nativePush='1';"
            + "button.disabled=false;"
            + "button.textContent='\uD83D\uDD14 \u7528 Chrome \u958B\u555F\u901A\u77E5';"
            + "button.addEventListener('click',function(event){"
            + "event.preventDefault();"
            + "event.stopImmediatePropagation();"
            + "BadmintonApp.openNotificationSetup(location.href);"
            + "},true);"
            + "}"
            + "}"
            + "})();";
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

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(3, 21, 35));
        webView.addJavascriptInterface(new NativeBridge(), "BadmintonApp");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(PAGE_READY_SCRIPT, null);
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
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
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
