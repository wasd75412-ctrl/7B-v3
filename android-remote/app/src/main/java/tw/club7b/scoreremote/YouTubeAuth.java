package tw.club7b.scoreremote;

import android.content.Context;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import java.util.Collections;
import java.util.concurrent.TimeUnit;

final class YouTubeAuth {
    static final String SCOPE = "https://www.googleapis.com/auth/youtube";

    private final Context context;
    private String token;

    YouTubeAuth(Context context) {
        this.context = context.getApplicationContext();
    }

    static AuthorizationRequest request() {
        return AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(SCOPE)))
                .build();
    }

    String token() throws Exception {
        if (token != null) return token;
        AuthorizationResult result = Tasks.await(
                Identity.getAuthorizationClient(context).authorize(request()), 30, TimeUnit.SECONDS);
        if (result.hasResolution()) return null;
        token = result.getAccessToken();
        return token;
    }

    String refresh() throws Exception {
        if (token != null) {
            try { GoogleAuthUtil.clearToken(context, token); } catch (Exception ignored) { }
        }
        token = null;
        return token();
    }
}
