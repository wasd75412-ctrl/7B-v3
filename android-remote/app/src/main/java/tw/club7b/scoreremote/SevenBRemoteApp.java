package tw.club7b.scoreremote;

import android.app.Application;

public final class SevenBRemoteApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ErrorLog.install(this);
        new Thread(() -> RecordingUploadStore.repairLargeFiles(this), "mp4-repair").start();
    }
}
