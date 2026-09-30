package tw.club7b.scoreremote;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class HomeWifi {
    static final String SSID = "AAA";

    private HomeWifi() { }

    static boolean matches(String ssid) {
        if (ssid == null) return false;
        String name = ssid.length() >= 2 && ssid.startsWith("\"") && ssid.endsWith("\"")
                ? ssid.substring(1, ssid.length() - 1) : ssid;
        return SSID.equals(name);
    }

    static boolean hasLocationPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasBackgroundLocationPermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean isLocationEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return manager.isLocationEnabled();
        return manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) || manager.isProviderEnabled(LocationManager.GPS_PROVIDER);
    }

    static boolean isConnected(Context context) {
        if (!hasLocationPermission(context)) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && matches(ssidFromCallback(context))) return true;
        WifiManager wifi = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi == null) return false;
        @SuppressWarnings("deprecation") WifiInfo info = wifi.getConnectionInfo();
        return info != null && matches(info.getSSID());
    }

    private static String ssidFromCallback(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return null;
        AtomicReference<String> ssid = new AtomicReference<>();
        CountDownLatch found = new CountDownLatch(1);
        ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback(
                ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO) {
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                if (capabilities.getTransportInfo() instanceof WifiInfo) {
                    ssid.set(((WifiInfo) capabilities.getTransportInfo()).getSSID());
                    found.countDown();
                }
            }
        };
        NetworkRequest request = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
        try {
            connectivity.registerNetworkCallback(request, callback);
            found.await(3, TimeUnit.SECONDS);
        } catch (RuntimeException | InterruptedException ignored) {
            if (ignored instanceof InterruptedException) Thread.currentThread().interrupt();
        } finally {
            try { connectivity.unregisterNetworkCallback(callback); } catch (RuntimeException ignored) { }
        }
        return ssid.get();
    }
}
