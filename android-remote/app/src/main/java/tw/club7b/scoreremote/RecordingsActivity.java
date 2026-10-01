package tw.club7b.scoreremote;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class RecordingsActivity extends ComponentActivity {
    private static final long REFRESH_MS = 2000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, List<RecordingTimeline.Match>> roomMatches = new HashMap<>();
    private final Map<String, Long> loadedAt = new HashMap<>();
    private final List<String> loadingRooms = new ArrayList<>();
    private LinearLayout list;
    private TextView youtubeStatus;
    private Button youtubeButton;
    private TextView wifiStatus;
    private boolean youtubeLinked;
    private String renderedSignature = "";

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            renderList(false);
            handler.postDelayed(this, REFRESH_MS);
        }
    };

    private final ActivityResultLauncher<IntentSenderRequest> authLauncher = registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                try {
                    Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(result.getData());
                    onYouTubeLinked();
                } catch (ApiException error) {
                    Toast.makeText(this, "YouTube 連結失敗", Toast.LENGTH_SHORT).show();
                }
            });

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildUi();
        checkYouTube();
    }

    @Override protected void onResume() {
        super.onResume();
        renderWifi();
        renderList(true);
        handler.postDelayed(refresh, REFRESH_MS);
    }

    @Override protected void onPause() {
        handler.removeCallbacks(refresh);
        super.onPause();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(11, 41, 65));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(18);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView title = text("錄影上傳", 22, true);
        root.addView(title);

        LinearLayout youtubeCard = card();
        youtubeStatus = text("YouTube 檢查中…", 15, true);
        youtubeButton = button("連結 YouTube", v -> connectYouTube());
        youtubeCard.addView(youtubeStatus);
        youtubeCard.addView(youtubeButton);
        root.addView(youtubeCard);

        LinearLayout wifiCard = card();
        wifiStatus = text("連上 Wi-Fi 自動上傳", 15, true);
        wifiCard.addView(wifiStatus);
        root.addView(wifiCard);

        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        root.addView(list);
        setContentView(scroll);
    }

    private void checkYouTube() {
        Identity.getAuthorizationClient(this).authorize(YouTubeAuth.request())
                .addOnSuccessListener(result -> {
                    youtubeLinked = !result.hasResolution();
                    renderYouTube();
                })
                .addOnFailureListener(error -> {
                    youtubeLinked = false;
                    renderYouTube();
                });
    }

    private void connectYouTube() {
        Identity.getAuthorizationClient(this).authorize(YouTubeAuth.request())
                .addOnSuccessListener(result -> {
                    if (result.hasResolution() && result.getPendingIntent() != null) {
                        authLauncher.launch(new IntentSenderRequest.Builder(
                                result.getPendingIntent().getIntentSender()).build());
                    } else {
                        onYouTubeLinked();
                    }
                })
                .addOnFailureListener(error -> Toast.makeText(this, "YouTube 連結失敗", Toast.LENGTH_SHORT).show());
    }

    private void onYouTubeLinked() {
        youtubeLinked = true;
        for (RecordingUploadStore.Entry entry : RecordingUploadStore.all(this)) {
            if (entry.status == RecordingUploadStore.Status.AUTH_REQUIRED) RecordingUploadStore.retry(this, entry.id);
        }
        YouTubeUploadScheduler.scheduleIfPending(this);
        renderYouTube();
        renderList(true);
    }

    private void renderYouTube() {
        youtubeStatus.setText(youtubeLinked ? "YouTube 已連結" : "YouTube 未連結");
        youtubeButton.setVisibility(youtubeLinked ? View.GONE : View.VISIBLE);
    }

    private void renderWifi() {
        wifiStatus.setText("連上 Wi-Fi 自動上傳");
    }

    private void renderList(boolean force) {
        List<RecordingUploadStore.Entry> entries = RecordingUploadStore.all(this);
        StringBuilder signature = new StringBuilder();
        for (RecordingUploadStore.Entry entry : entries) {
            signature.append(entry.id).append(entry.status).append(entry.progress).append(entry.message)
                    .append(entry.description.length()).append(roomMatches.containsKey(entry.roomId)).append(';');
        }
        if (!force && signature.toString().equals(renderedSignature)) return;
        renderedSignature = signature.toString();
        list.removeAllViews();
        if (entries.isEmpty()) {
            list.addView(text("尚無比分轉播錄影", 15, false));
            return;
        }
        for (RecordingUploadStore.Entry entry : entries) list.addView(recordingCard(entry));
    }

    private View recordingCard(RecordingUploadStore.Entry entry) {
        LinearLayout card = card();
        String title = entry.title.isEmpty()
                ? RecordingTimeline.title(entry.startMs, RecordingUploadStore.ordinal(this, entry)) : entry.title;
        card.addView(text(title, 17, true));
        card.addView(text(statusText(entry), 14, false));
        String timeline = timeline(entry);
        TextView timelineView = text(timeline == null ? "讀取時間軸…" : timeline, 13, false);
        timelineView.setTypeface(Typeface.MONOSPACE);
        timelineView.setTextIsSelectable(true);
        card.addView(timelineView);
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        if (timeline != null) actions.addView(button("複製時間軸", v -> copy(timeline)));
        actions.addView(button("刪除", v -> confirmDelete(entry)));
        if (entry.status == RecordingUploadStore.Status.FAILED || entry.status == RecordingUploadStore.Status.AUTH_REQUIRED) {
            actions.addView(button("重試", v -> {
                RecordingUploadStore.retry(this, entry.id);
                YouTubeUploadScheduler.schedule(this);
                renderList(true);
            }));
        }
        card.addView(actions);
        return card;
    }

    private String statusText(RecordingUploadStore.Entry entry) {
        switch (entry.status) {
            case UPLOADING: return "上傳中 " + entry.progress + "%";
            case UPLOADED: return "已上傳";
            case AUTH_REQUIRED: return "需要連結 YouTube";
            case FAILED: return "上傳失敗" + (entry.message.isEmpty() ? "" : "：" + entry.message);
            case MISSING: return "影片已不存在";
            default: return entry.message.isEmpty() ? "等待 Wi-Fi" : entry.message;
        }
    }

    private void confirmDelete(RecordingUploadStore.Entry entry) {
        new AlertDialog.Builder(this)
                .setMessage("確定刪除這段時間軸？")
                .setPositiveButton("刪除", (dialog, which) -> {
                    RecordingUploadStore.remove(this, entry.id);
                    renderList(true);
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private String timeline(RecordingUploadStore.Entry entry) {
        List<RecordingTimeline.Match> matches = roomMatches.get(entry.roomId);
        if (matches != null) {
            String built = RecordingTimeline.timeline(matches, entry.startMs, entry.endMs);
            if (RecordingTimeline.hasGameChapter(built) || !RecordingTimeline.hasGameChapter(entry.description)) return built;
            return entry.description;
        }
        long age = System.currentTimeMillis() - loadedAt.getOrDefault(entry.roomId, 0L);
        if (age > 15_000L) loadRoom(entry.roomId);
        return RecordingTimeline.hasGameChapter(entry.description) ? entry.description : null;
    }

    private void loadRoom(String roomId) {
        if (roomId.isEmpty()) {
            roomMatches.put(roomId, new ArrayList<>());
            loadedAt.put(roomId, System.currentTimeMillis());
            return;
        }
        if (loadingRooms.contains(roomId)) return;
        loadingRooms.add(roomId);
        MatchHistoryRooms.load(BackgroundScoreController.firestore(this), roomId)
                .addOnCompleteListener(task -> {
                    loadingRooms.remove(roomId);
                    roomMatches.put(roomId, RecordingTimeline.matchesFromRoom(task.isSuccessful() ? task.getResult() : null));
                    loadedAt.put(roomId, System.currentTimeMillis());
                    renderList(true);
                });
    }

    private void copy(String timeline) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null) return;
        clipboard.setPrimaryClip(ClipData.newPlainText("時間軸", timeline));
        Toast.makeText(this, "已複製時間軸", Toast.LENGTH_SHORT).show();
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(14);
        card.setPadding(pad, pad, pad, pad);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.argb(28, 255, 255, 255));
        background.setCornerRadius(dp(16));
        card.setBackground(background);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(12);
        card.setLayoutParams(params);
        return card;
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(sp);
        view.setLineSpacing(0f, 1.2f);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(0, dp(3), 0, dp(3));
        return view;
    }

    private Button button(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
