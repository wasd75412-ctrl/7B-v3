package tw.club7b.scoreremote;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.SetOptions;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;
import org.webrtc.DataChannel;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;

/**
 * Direct phone-to-iPad data channel over the shared hotspot. Firestore carries only the
 * offer/answer, and every command is still written to Firestore as well, so this link can only
 * make delivery faster. All state is touched on the main looper; WebRTC callbacks arrive on its
 * own threads and must only post back, or disposing a peer can deadlock against a callback.
 */
final class LocalLinkClient {
    static final String DOC_ID = "localLink";
    private static final long ICE_GATHER_TIMEOUT_MS = 2_000L;
    private static final long ANSWER_TIMEOUT_MS = 45_000L;
    private static final long RETRY_DELAY_MS = 3_000L;
    private static final long RETRY_MAX_DELAY_MS = 5 * 60_000L;
    private static final String PREFS = "local_link";

    private static LocalLinkClient shared;

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable restartTask = this::restart;
    private PeerConnectionFactory factory;
    private boolean factoryFailed;
    private String roomId = "";
    private DocumentReference linkRef;
    private ListenerRegistration linkListener;
    private PeerConnection peer;
    private volatile DataChannel channel;
    private String sessionId = "";
    private boolean answerApplied;
    private boolean offerSent;
    private Object ipadReadySeen;
    private String deviceId;
    private int failedAttempts;
    private String desiredRoomId = "";
    private boolean matchActive;

    private LocalLinkClient(Context context) {
        this.context = context.getApplicationContext();
    }

    static synchronized LocalLinkClient shared(Context context) {
        if (shared == null) shared = new LocalLinkClient(context);
        return shared;
    }

    void ensureStarted(RemoteSessionStore.Session session) {
        handler.post(() -> start(session));
    }

    // Every offer is a Firestore write, so the link only runs while the room has a match in play.
    void setMatchActive(String roomId, boolean active) {
        handler.post(() -> {
            if (!roomId.equals(desiredRoomId)) return;
            matchActive = active;
            sync();
        });
    }

    boolean isOpen() {
        DataChannel current = channel;
        return current != null && current.state() == DataChannel.State.OPEN;
    }

    boolean send(Map<String, Object> message) {
        DataChannel current = channel;
        if (current == null || current.state() != DataChannel.State.OPEN) return false;
        try {
            byte[] bytes = new JSONObject(message).toString().getBytes(StandardCharsets.UTF_8);
            return current.send(new DataChannel.Buffer(ByteBuffer.wrap(bytes), false));
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void start(RemoteSessionStore.Session session) {
        if (!session.isAuthorized()) return;
        if (!session.roomId.equals(desiredRoomId)) {
            desiredRoomId = session.roomId;
            matchActive = false;
        }
        sync();
    }

    private void sync() {
        if (!matchActive || desiredRoomId.isEmpty()) {
            stop();
            return;
        }
        if (desiredRoomId.equals(roomId) && linkListener != null) return;
        stop();
        roomId = desiredRoomId;
        ipadReadySeen = null;
        linkRef = BackgroundScoreController.firestore(context).collection("badmintonRooms").document(roomId)
                .collection("remoteControl").document(DOC_ID);
        linkListener = linkRef.addSnapshotListener((snapshot, error) -> {
            if (error == null && snapshot != null && snapshot.exists()) onLinkDocument(snapshot);
        });
        restart();
    }

    private void stop() {
        if (linkListener != null) linkListener.remove();
        linkListener = null;
        closePeer();
        linkRef = null;
        roomId = "";
        ipadReadySeen = null;
        failedAttempts = 0;
    }

    private void closePeer() {
        handler.removeCallbacks(restartTask);
        DataChannel current = channel;
        channel = null;
        if (current != null) {
            current.unregisterObserver();
            current.close();
            current.dispose();
        }
        if (peer != null) peer.dispose();
        peer = null;
        sessionId = "";
        answerApplied = false;
        offerSent = false;
    }

    private void restart() {
        closePeer();
        if (linkRef == null) return;
        PeerConnectionFactory peerFactory = factory();
        if (peerFactory == null) return;
        PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(new ArrayList<>());
        config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        config.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_ONCE;
        String id = UUID.randomUUID().toString();
        PeerConnection created = peerFactory.createPeerConnection(config, new PeerObserver(id));
        if (created == null) {
            scheduleRetry();
            return;
        }
        peer = created;
        sessionId = id;
        DataChannel.Init init = new DataChannel.Init();
        init.ordered = true;
        DataChannel createdChannel = peer.createDataChannel("bcm", init);
        if (createdChannel != null) createdChannel.registerObserver(new ChannelObserver(id));
        channel = createdChannel;
        peer.createOffer(new SimpleSdpObserver() {
            @Override public void onCreateSuccess(SessionDescription offer) {
                handler.post(() -> applyLocalOffer(id, offer));
            }
            @Override public void onCreateFailure(String error) {
                handler.post(() -> retryIfCurrent(id));
            }
        }, new MediaConstraints());
    }

    private void applyLocalOffer(String id, SessionDescription offer) {
        if (!id.equals(sessionId) || peer == null) return;
        peer.setLocalDescription(new SimpleSdpObserver() {
            @Override public void onSetSuccess() {
                handler.postDelayed(() -> sendOffer(id), ICE_GATHER_TIMEOUT_MS);
            }
            @Override public void onSetFailure(String error) {
                handler.post(() -> retryIfCurrent(id));
            }
        }, offer);
    }

    private void sendOffer(String id) {
        if (!id.equals(sessionId) || peer == null || offerSent || linkRef == null) return;
        SessionDescription local = peer.getLocalDescription();
        if (local == null) {
            scheduleRetry();
            return;
        }
        offerSent = true;
        failedAttempts++;
        Map<String, Object> offer = new HashMap<>();
        offer.put("sessionId", id);
        offer.put("sdp", local.description);
        offer.put("clientCreatedAt", System.currentTimeMillis());
        offer.put("createdAt", FieldValue.serverTimestamp());
        Map<String, Object> offers = new HashMap<>();
        offers.put(deviceId(), offer);
        Map<String, Object> updates = new HashMap<>();
        updates.put("offers", offers);
        linkRef.set(updates, SetOptions.merge());
        handler.postDelayed(restartTask, Math.max(ANSWER_TIMEOUT_MS, retryDelay()));
    }

    private void onLinkDocument(DocumentSnapshot snapshot) {
        Object ready = snapshot.get("ipadReadyAt");
        if (ready != null && !ready.equals(ipadReadySeen)) {
            boolean firstSeen = ipadReadySeen == null;
            ipadReadySeen = ready;
            if (!firstSeen && !isOpen()) {
                failedAttempts = 0;
                restart();
                return;
            }
        }
        Object answers = snapshot.get("answers");
        Object value = answers instanceof Map ? ((Map<?, ?>) answers).get(deviceId()) : null;
        if (!(value instanceof Map) || peer == null || answerApplied) return;
        Map<?, ?> answer = (Map<?, ?>) value;
        if (!sessionId.equals(String.valueOf(answer.get("sessionId")))) return;
        Object sdp = answer.get("sdp");
        if (!(sdp instanceof String) || ((String) sdp).isEmpty()) return;
        answerApplied = true;
        handler.removeCallbacks(restartTask);
        String id = sessionId;
        peer.setRemoteDescription(new SimpleSdpObserver() {
            @Override public void onSetFailure(String error) {
                handler.post(() -> retryIfCurrent(id));
            }
        }, new SessionDescription(SessionDescription.Type.ANSWER, (String) sdp));
    }

    String deviceId() {
        if (deviceId != null) return deviceId;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String stored = preferences.getString("deviceId", "");
        if (stored.isEmpty()) {
            stored = UUID.randomUUID().toString().replace("-", "");
            preferences.edit().putString("deviceId", stored).apply();
        }
        deviceId = stored;
        return deviceId;
    }

    private void retryIfCurrent(String id) {
        if (id.equals(sessionId)) scheduleRetry();
    }

    // Every attempt writes an offer and the iPad writes an answer, so an unreachable iPad must not
    // turn this into a Firestore write loop.
    private void scheduleRetry() {
        handler.removeCallbacks(restartTask);
        if (linkRef != null) handler.postDelayed(restartTask, retryDelay());
    }

    private long retryDelay() {
        int exponent = Math.max(0, Math.min(failedAttempts - 1, 7));
        return Math.min(RETRY_MAX_DELAY_MS, RETRY_DELAY_MS << exponent);
    }

    private PeerConnectionFactory factory() {
        if (factory != null || factoryFailed) return factory;
        try {
            PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context)
                    .createInitializationOptions());
            factory = PeerConnectionFactory.builder().createPeerConnectionFactory();
        } catch (RuntimeException | UnsatisfiedLinkError error) {
            factoryFailed = true;
            factory = null;
        }
        return factory;
    }

    private final class PeerObserver implements PeerConnection.Observer {
        private final String id;

        PeerObserver(String id) {
            this.id = id;
        }

        @Override public void onConnectionChange(PeerConnection.PeerConnectionState state) {
            if (state == PeerConnection.PeerConnectionState.FAILED
                    || state == PeerConnection.PeerConnectionState.DISCONNECTED
                    || state == PeerConnection.PeerConnectionState.CLOSED) {
                handler.post(() -> retryIfCurrent(id));
            }
        }

        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) {
            if (state == PeerConnection.IceGatheringState.COMPLETE) handler.post(() -> sendOffer(id));
        }

        @Override public void onSignalingChange(PeerConnection.SignalingState state) { }
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) { }
        @Override public void onIceConnectionReceivingChange(boolean receiving) { }
        @Override public void onIceCandidate(IceCandidate candidate) { }
        @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) { }
        @Override public void onAddStream(MediaStream stream) { }
        @Override public void onRemoveStream(MediaStream stream) { }
        @Override public void onDataChannel(DataChannel dataChannel) { }
        @Override public void onRenegotiationNeeded() { }
        @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) { }
    }

    private final class ChannelObserver implements DataChannel.Observer {
        private final String id;

        ChannelObserver(String id) {
            this.id = id;
        }

        @Override public void onStateChange() {
            handler.post(() -> {
                DataChannel current = channel;
                if (!id.equals(sessionId) || current == null) return;
                if (current.state() == DataChannel.State.OPEN) failedAttempts = 0;
                else if (current.state() == DataChannel.State.CLOSED) scheduleRetry();
            });
        }

        @Override public void onBufferedAmountChange(long previousAmount) { }
        @Override public void onMessage(DataChannel.Buffer buffer) { }
    }

    private static class SimpleSdpObserver implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription description) { }
        @Override public void onSetSuccess() { }
        @Override public void onCreateFailure(String error) { }
        @Override public void onSetFailure(String error) { }
    }
}
