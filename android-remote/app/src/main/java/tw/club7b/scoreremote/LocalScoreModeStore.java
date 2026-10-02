package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONObject;

final class LocalScoreModeStore {
    private static final String PREFS = "local_score_hub_v1";
    private static final String MODE = "mode";
    private static final String HOST = "host";
    static final String MODE_OFF = "off";
    static final String MODE_HOST = "host";
    static final String MODE_CLIENT = "client";

    private LocalScoreModeStore() {
    }

    static void setMode(Context context, String mode, String host) {
        prefs(context).edit()
                .putString(MODE, normalizeMode(mode))
                .putString(HOST, normalizeHost(host))
                .apply();
    }

    static String mode(Context context) {
        return normalizeMode(prefs(context).getString(MODE, MODE_OFF));
    }

    static String host(Context context) {
        return normalizeHost(prefs(context).getString(HOST, ""));
    }

    static boolean isHost(Context context) {
        return MODE_HOST.equals(mode(context));
    }

    static boolean isClient(Context context) {
        return MODE_CLIENT.equals(mode(context)) && !host(context).isEmpty();
    }

    static boolean isEnabled(Context context) {
        return isHost(context) || isClient(context);
    }

    static JSONObject postAction(Context context, String action) throws Exception {
        if (isHost(context)) {
            LocalScoreHubServer hub = LocalScoreHubServer.getRunning();
            if (hub == null) throw new IllegalStateException("本機主機未開啟");
            boolean ok = hub.applyAction(action);
            JSONObject snapshot = hub.state().snapshot();
            snapshot.put("ok", ok);
            return snapshot;
        }
        if (!isClient(context)) throw new IllegalStateException("尚未加入本機主機");
        return request(host(context), "/api/action", "POST", new JSONObject().put("action", action).toString());
    }

    static JSONObject fetchState(Context context) throws Exception {
        if (isHost(context)) {
            LocalScoreHubServer hub = LocalScoreHubServer.getRunning();
            if (hub == null) throw new IllegalStateException("本機主機未開啟");
            return hub.state().snapshot();
        }
        if (!isClient(context)) throw new IllegalStateException("尚未加入本機主機");
        return request(host(context), "/api/state", "GET", null);
    }

    private static JSONObject request(String host, String path, String method, String body) throws Exception {
        URL url = new URL(endpoint(host, path));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(2500);
        connection.setReadTimeout(2500);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        if (body != null) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }
        int code = connection.getResponseCode();
        InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String text = readAll(stream);
        connection.disconnect();
        if (text == null || text.isEmpty()) throw new IllegalStateException("本機回應空白");
        return new JSONObject(text);
    }

    static String endpoint(String host, String path) {
        String clean = normalizeHost(host).replaceFirst("^https?://", "");
        if (!clean.contains(":")) clean = clean + ":" + LocalScoreHubServer.PORT;
        String route = path.startsWith("/") ? path : "/" + path;
        return "http://" + clean + route;
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[2048];
        int read;
        while ((read = stream.read(chunk)) >= 0) buffer.write(chunk, 0, read);
        return buffer.toString("UTF-8");
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String normalizeMode(String mode) {
        String value = mode == null ? MODE_OFF : mode.trim().toLowerCase(Locale.US);
        if (MODE_HOST.equals(value) || MODE_CLIENT.equals(value)) return value;
        return MODE_OFF;
    }

    private static String normalizeHost(String host) {
        if (host == null) return "";
        return host.trim()
                .replaceFirst("^https?://", "")
                .replaceAll("/$", "");
    }
}
