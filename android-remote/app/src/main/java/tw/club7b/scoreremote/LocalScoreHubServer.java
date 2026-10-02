package tw.club7b.scoreremote;

import android.content.Context;
import android.content.res.AssetManager;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

final class LocalScoreHubServer {
    static final int PORT = 17878;

    interface Listener {
        void onChanged(LocalScoreState state);
    }

    private static final Object GLOBAL_LOCK = new Object();
    private static LocalScoreHubServer running;

    private final Context appContext;
    private final LocalScoreState state = new LocalScoreState();
    private final AtomicBoolean alive = new AtomicBoolean(false);
    private final ExecutorService acceptPool = Executors.newSingleThreadExecutor();
    private final ExecutorService clientPool = Executors.newCachedThreadPool();
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private ServerSocket serverSocket;
    private int clientCount;

    private LocalScoreHubServer(Context context) {
        this.appContext = context.getApplicationContext();
    }

    static LocalScoreHubServer getRunning() {
        synchronized (GLOBAL_LOCK) {
            return running;
        }
    }

    static LocalScoreHubServer start(Context context, int target, int cap, boolean deuce) throws IOException {
        synchronized (GLOBAL_LOCK) {
            if (running != null) return running;
            LocalScoreHubServer hub = new LocalScoreHubServer(context);
            hub.state.configureRules(target, cap, deuce);
            hub.serverSocket = new ServerSocket(PORT);
            hub.serverSocket.setReuseAddress(true);
            hub.alive.set(true);
            running = hub;
            hub.acceptPool.execute(hub::acceptLoop);
            return hub;
        }
    }

    static void stopRunning() {
        LocalScoreHubServer hub;
        synchronized (GLOBAL_LOCK) {
            hub = running;
            running = null;
        }
        if (hub != null) hub.shutdown();
    }

    LocalScoreState state() {
        return state;
    }

    void addListener(Listener listener) {
        if (listener != null) listeners.add(listener);
    }

    void removeListener(Listener listener) {
        listeners.remove(listener);
    }

    JSONObject infoJson() {
        try {
            JSONObject info = new JSONObject();
            info.put("protocol", "bcm-local-score-v1");
            info.put("port", PORT);
            info.put("addresses", new org.json.JSONArray(localAddresses()));
            info.put("url", preferredUrl());
            info.put("running", alive.get());
            info.put("clients", clientCount);
            return info;
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    String preferredUrl() {
        List<String> addresses = localAddresses();
        String host = addresses.isEmpty() ? "127.0.0.1" : addresses.get(0);
        return "http://" + host + ":" + PORT + "/";
    }

    boolean applyAction(String action) {
        LocalScoreState.ApplyResult result = state.apply(action);
        if (result.ok) notifyListeners();
        return result.ok;
    }

    void markUploaded() {
        state.markUploaded();
        notifyListeners();
    }

    private void notifyListeners() {
        for (Listener listener : listeners) listener.onChanged(state);
    }

    private void acceptLoop() {
        while (alive.get()) {
            try {
                Socket socket = serverSocket.accept();
                clientPool.execute(() -> handleClient(socket));
            } catch (IOException closed) {
                if (!alive.get()) break;
            }
        }
    }

    private void handleClient(Socket socket) {
        bumpClients(1);
        try {
            socket.setSoTimeout(15000);
            BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isEmpty()) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeResponse(socket, 400, "text/plain; charset=utf-8", "bad request");
                return;
            }
            String method = parts[0].toUpperCase(Locale.US);
            String path = parts[1];
            int queryAt = path.indexOf('?');
            String route = queryAt >= 0 ? path.substring(0, queryAt) : path;
            Headers headers = readHeaders(reader);
            byte[] body = readBody(socket.getInputStream(), headers.contentLength);

            if ("GET".equals(method) && ("/".equals(route) || "/index.html".equals(route))) {
                writeAsset(socket, "local-hub/index.html", "text/html; charset=utf-8");
                return;
            }
            if ("GET".equals(method) && "/api/info".equals(route)) {
                writeJson(socket, 200, infoJson());
                return;
            }
            if ("GET".equals(method) && "/api/state".equals(route)) {
                writeJson(socket, 200, state.snapshot());
                return;
            }
            if ("POST".equals(method) && "/api/action".equals(route)) {
                JSONObject payload = body.length == 0 ? new JSONObject() : new JSONObject(new String(body, StandardCharsets.UTF_8));
                String action = payload.optString("action", "");
                boolean ok = applyAction(action);
                JSONObject response = state.snapshot();
                response.put("ok", ok);
                writeJson(socket, ok ? 200 : 409, response);
                return;
            }
            if ("POST".equals(method) && "/api/uploaded".equals(route)) {
                markUploaded();
                writeJson(socket, 200, state.snapshot());
                return;
            }
            writeResponse(socket, 404, "text/plain; charset=utf-8", "not found");
        } catch (Exception ignored) {
            // Drop broken client sockets quietly; the hub keeps serving.
        } finally {
            bumpClients(-1);
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    private void bumpClients(int delta) {
        synchronized (state) {
            clientCount = Math.max(0, clientCount + delta);
            state.setClients(clientCount);
        }
    }

    private void writeAsset(Socket socket, String assetPath, String contentType) throws IOException {
        AssetManager assets = appContext.getAssets();
        try (InputStream input = assets.open(assetPath)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int read;
            while ((read = input.read(chunk)) >= 0) buffer.write(chunk, 0, read);
            writeBytes(socket, 200, contentType, buffer.toByteArray());
        }
    }

    private void writeJson(Socket socket, int code, JSONObject json) throws IOException {
        writeResponse(socket, code, "application/json; charset=utf-8", json.toString());
    }

    private void writeResponse(Socket socket, int code, String contentType, String body) throws IOException {
        writeBytes(socket, code, contentType, body.getBytes(StandardCharsets.UTF_8));
    }

    private void writeBytes(Socket socket, int code, String contentType, byte[] body) throws IOException {
        String status = code == 200 ? "OK" : code == 409 ? "Conflict" : code == 404 ? "Not Found" : "Error";
        String header = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: Content-Type\r\n"
                + "Connection: close\r\n\r\n";
        OutputStream output = socket.getOutputStream();
        output.write(header.getBytes(StandardCharsets.UTF_8));
        output.write(body);
        output.flush();
    }

    private static Headers readHeaders(BufferedReader reader) throws IOException {
        Headers headers = new Headers();
        String line;
        while ((line = reader.readLine()) != null && !line.isEmpty()) {
            int split = line.indexOf(':');
            if (split <= 0) continue;
            String name = line.substring(0, split).trim().toLowerCase(Locale.US);
            String value = line.substring(split + 1).trim();
            if ("content-length".equals(name)) {
                try {
                    headers.contentLength = Math.max(0, Integer.parseInt(value));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return headers;
    }

    private static byte[] readBody(InputStream input, int length) throws IOException {
        if (length <= 0) return new byte[0];
        byte[] body = new byte[length];
        int offset = 0;
        while (offset < length) {
            int read = input.read(body, offset, length - offset);
            if (read < 0) break;
            offset += read;
        }
        if (offset == length) return body;
        byte[] clipped = new byte[offset];
        System.arraycopy(body, 0, clipped, 0, offset);
        return clipped;
    }

    static List<String> localAddresses() {
        List<String> addresses = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            if (interfaces == null) return addresses;
            for (NetworkInterface networkInterface : Collections.list(interfaces)) {
                if (!networkInterface.isUp() || networkInterface.isLoopback()) continue;
                for (InetAddress address : Collections.list(networkInterface.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || address.isLoopbackAddress()) continue;
                    String host = address.getHostAddress();
                    if (host != null && !host.isEmpty()) addresses.add(host);
                }
            }
        } catch (SocketException ignored) {
        }
        addresses.sort((left, right) -> Integer.compare(addressRank(left), addressRank(right)));
        return addresses;
    }

    private static int addressRank(String host) {
        if (host.startsWith("192.168.43.") || host.startsWith("192.168.137.")) return 0;
        if (host.startsWith("192.168.")) return 1;
        if (host.startsWith("10.")) return 2;
        if (host.startsWith("172.")) return 3;
        return 9;
    }

    private void shutdown() {
        alive.set(false);
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
        acceptPool.shutdownNow();
        clientPool.shutdownNow();
    }

    private static final class Headers {
        int contentLength;
    }
}
