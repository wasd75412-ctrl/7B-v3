package tw.club7b.scoreremote;

import android.app.Application;

public final class SevenBRemoteApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ErrorLog.install(this);
    }
}
