package tw.club7b.scoreremote;

import com.google.android.gms.tasks.Task;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.QuerySnapshot;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class MatchHistoryRooms {
    private MatchHistoryRooms() { }

    static Task<Map<String, Object>> load(FirebaseFirestore firestore, String roomId) {
        DocumentReference roomRef = firestore.collection("badmintonRooms").document(roomId);
        Task<DocumentSnapshot> roomTask = roomRef.get();
        Task<QuerySnapshot> archiveTask = roomRef.collection("matchHistory").get();
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
