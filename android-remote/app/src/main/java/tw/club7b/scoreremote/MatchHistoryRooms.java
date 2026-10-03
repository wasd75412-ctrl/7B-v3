package tw.club7b.scoreremote;

import com.google.android.gms.tasks.Task;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QuerySnapshot;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class MatchHistoryRooms {
    // Archived endedAt values are JavaScript toISOString() strings, so the bound must match that shape.
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private MatchHistoryRooms() { }

    static Task<Map<String, Object>> load(FirebaseFirestore firestore, String roomId) {
        return load(firestore, roomId, 0L);
    }

    static Task<Map<String, Object>> load(FirebaseFirestore firestore, String roomId, long endedSinceMs) {
        DocumentReference roomRef = firestore.collection("badmintonRooms").document(roomId);
        Task<DocumentSnapshot> roomTask = roomRef.get();
        Query archive = roomRef.collection("matchHistory");
        if (endedSinceMs > 0L) {
            archive = archive.whereGreaterThanOrEqualTo("endedAt", ISO_MILLIS.format(Instant.ofEpochMilli(endedSinceMs)));
        }
        Task<QuerySnapshot> archiveTask = archive.get();
        return roomTask.continueWithTask(roomDone -> archiveTask.continueWith(archiveDone -> {
            List<Map<String, Object>> archived = new ArrayList<>();
            if (archiveDone.isSuccessful() && archiveDone.getResult() != null) {
                for (DocumentSnapshot doc : archiveDone.getResult().getDocuments()) {
                    Map<String, Object> data = doc.getData();
                    if (data == null) continue;
                    if (!data.containsKey("matchId")) data.put("matchId", doc.getId());
                    archived.add(data);
                }
            }
            DocumentSnapshot room = roomDone.isSuccessful() ? roomDone.getResult() : null;
            return RecordingTimeline.withArchivedHistory(room == null ? null : room.getData(), archived);
        }));
    }
}
