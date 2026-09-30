package tw.club7b.scoreremote;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class YouTubeUploader {
    static final String PLAYLIST_TITLE = "7B羽球社";
    static final int CHUNK_BYTES = 32 * 256 * 1024;
    private static final String UPLOAD_URL =
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
    private static final String API = "https://www.googleapis.com/youtube/v3/";

    static final class HttpError extends IOException {
        final int code;
        final String body;

        HttpError(int code, String body) {
            super("HTTP " + code + (body == null || body.isEmpty() ? "" : ": " + body));
            this.code = code;
            this.body = body == null ? "" : body;
        }

        boolean isQuota() {
            return code == 403 && (body.contains("quotaExceeded") || body.contains("uploadLimitExceeded"));
        }
    }

    interface Progress {
        boolean keepGoing();
        void onProgress(long sent, long total) throws IOException;
    }

    private YouTubeUploader() { }

    static String createSession(String token, String title, String description, long length)
            throws IOException, JSONException {
        JSONObject body = new JSONObject()
                .put("snippet", new JSONObject()
                        .put("title", clean(title, 100))
                        .put("description", clean(description, 4900))
                        .put("categoryId", "17"))
                .put("status", new JSONObject()
                        .put("privacyStatus", "unlisted")
                        .put("selfDeclaredMadeForKids", false));
        HttpURLConnection connection = open(UPLOAD_URL, "POST", token);
        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        connection.setRequestProperty("X-Upload-Content-Type", "video/mp4");
        connection.setRequestProperty("X-Upload-Content-Length", String.valueOf(length));
        writeJson(connection, body);
        int code = connection.getResponseCode();
        if (code != 200) throw new HttpError(code, readError(connection));
        String location = connection.getHeaderField("Location");
        connection.disconnect();
        if (location == null || location.isEmpty()) throw new IOException("No upload session");
        return location;
    }

    static String upload(String session, String token, FileChannel file, long length, Progress progress)
            throws IOException, JSONException {
        SessionState state = queryState(session, token, length);
        if (state.videoId != null) return state.videoId;
        long offset = state.nextOffset;
        progress.onProgress(offset, length);
        ByteBuffer buffer = ByteBuffer.allocate(CHUNK_BYTES);
        while (offset < length) {
            if (!progress.keepGoing()) return null;
            int size = (int) Math.min(CHUNK_BYTES, length - offset);
            buffer.clear();
            buffer.limit(size);
            file.position(offset);
            while (buffer.hasRemaining()) {
                if (file.read(buffer) < 0) throw new IOException("Video file ended early");
            }
            HttpURLConnection connection = open(session, "PUT", token);
            connection.setRequestProperty("Content-Type", "video/mp4");
            connection.setRequestProperty("Content-Range",
                    "bytes " + offset + "-" + (offset + size - 1) + "/" + length);
            connection.setFixedLengthStreamingMode(size);
            connection.setDoOutput(true);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(buffer.array(), 0, size);
            }
            int code = connection.getResponseCode();
            if (code == 200 || code == 201) return videoId(connection);
            if (code != 308) throw new HttpError(code, readError(connection));
            offset = nextOffset(connection.getHeaderField("Range"));
            connection.disconnect();
            progress.onProgress(offset, length);
        }
        return queryState(session, token, length).videoId;
    }

    private static final class SessionState {
        final long nextOffset;
        final String videoId;

        SessionState(long nextOffset, String videoId) {
            this.nextOffset = nextOffset;
            this.videoId = videoId;
        }
    }

    private static SessionState queryState(String session, String token, long length) throws IOException, JSONException {
        HttpURLConnection connection = open(session, "PUT", token);
        connection.setRequestProperty("Content-Range", "bytes */" + length);
        connection.setFixedLengthStreamingMode(0);
        connection.setDoOutput(true);
        connection.getOutputStream().close();
        int code = connection.getResponseCode();
        if (code == 200 || code == 201) return new SessionState(length, videoId(connection));
        if (code != 308) throw new HttpError(code, readError(connection));
        long offset = nextOffset(connection.getHeaderField("Range"));
        connection.disconnect();
        return new SessionState(offset, null);
    }

    static String findOrCreatePlaylist(String token) throws IOException, JSONException {
        String pageToken = "";
        do {
            String url = API + "playlists?part=snippet&mine=true&maxResults=50"
                    + (pageToken.isEmpty() ? "" : "&pageToken=" + URLEncoder.encode(pageToken, "UTF-8"));
            JSONObject page = getJson(url, token);
            JSONArray items = page.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    if (PLAYLIST_TITLE.equals(item.optJSONObject("snippet") == null ? "" :
                            item.getJSONObject("snippet").optString("title").trim())) return item.getString("id");
                }
            }
            pageToken = page.optString("nextPageToken");
        } while (!pageToken.isEmpty());
        JSONObject body = new JSONObject()
                .put("snippet", new JSONObject().put("title", PLAYLIST_TITLE))
                .put("status", new JSONObject().put("privacyStatus", "unlisted"));
        return postJson(API + "playlists?part=snippet,status", token, body).getString("id");
    }

    static void addToPlaylist(String token, String playlistId, String videoId) throws IOException, JSONException {
        JSONObject body = new JSONObject().put("snippet", new JSONObject()
                .put("playlistId", playlistId)
                .put("resourceId", new JSONObject().put("kind", "youtube#video").put("videoId", videoId)));
        postJson(API + "playlistItems?part=snippet", token, body);
    }

    static long nextOffset(String range) {
        if (range == null) return 0L;
        int dash = range.lastIndexOf('-');
        if (dash < 0) return 0L;
        try {
            return Long.parseLong(range.substring(dash + 1).trim()) + 1L;
        } catch (NumberFormatException invalid) {
            return 0L;
        }
    }

    static String clean(String value, int maxLength) {
        String text = value == null ? "" : value.replace("<", "").replace(">", "").trim();
        return text.length() > maxLength ? text.substring(0, maxLength) : text;
    }

    private static HttpURLConnection open(String url, String method, String token) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(20_000);
        connection.setReadTimeout(120_000);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        return connection;
    }

    private static JSONObject getJson(String url, String token) throws IOException, JSONException {
        HttpURLConnection connection = open(url, "GET", token);
        int code = connection.getResponseCode();
        if (code != 200) throw new HttpError(code, readError(connection));
        return new JSONObject(read(connection.getInputStream()));
    }

    private static JSONObject postJson(String url, String token, JSONObject body) throws IOException, JSONException {
        HttpURLConnection connection = open(url, "POST", token);
        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        writeJson(connection, body);
        int code = connection.getResponseCode();
        if (code != 200) throw new HttpError(code, readError(connection));
        return new JSONObject(read(connection.getInputStream()));
    }

    private static void writeJson(HttpURLConnection connection, JSONObject body) throws IOException {
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(bytes);
        }
    }

    private static String videoId(HttpURLConnection connection) throws IOException, JSONException {
        String id = new JSONObject(read(connection.getInputStream())).optString("id");
        connection.disconnect();
        if (id.isEmpty()) throw new IOException("No video id");
        return id;
    }

    private static String readError(HttpURLConnection connection) {
        try {
            InputStream error = connection.getErrorStream();
            return error == null ? "" : read(error);
        } catch (IOException ignored) {
            return "";
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream input) throws IOException {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString("UTF-8");
        }
    }
}
