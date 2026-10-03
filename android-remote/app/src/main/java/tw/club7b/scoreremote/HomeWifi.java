package tw.club7b.scoreremote;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;

import java.net.Inet4Address;
import java.net.InetAddress;

final class HomeWifi {
    private HomeWifi() { }

    static boolean isConnected(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return false;
        for (Network network : connectivity.getAllNetworks()) {
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(network);
            if (isWifiInternet(capabilities) && !isHotspot(connectivity, network, capabilities)) return true;
        }
        return false;
    }

    static boolean isHotspotOnly(Context context) {
        ConnectivityManager connectivity = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return false;
        boolean hotspot = false;
        for (Network network : connectivity.getAllNetworks()) {
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(network);
            if (!isWifiInternet(capabilities)) continue;
            if (!isHotspot(connectivity, network, capabilities)) return false;
            hotspot = true;
        }
        return hotspot;
    }

    private static boolean isHotspot(ConnectivityManager connectivity, Network network, NetworkCapabilities capabilities) {
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) return true;
        LinkProperties link = connectivity.getLinkProperties(network);
        if (link == null) return false;
        for (LinkAddress address : link.getLinkAddresses()) {
            if (isPhoneHotspotAddress(address.getAddress())) return true;
        }
        return false;
    }

    // iPhone hotspots report as unmetered, so their fixed 172.20.10.0/28 range is the only tell.
    // 192.168.43.0/24 is the default Android tethering range.
    static boolean isPhoneHotspotAddress(InetAddress address) {
        if (!(address instanceof Inet4Address)) return false;
        byte[] ip = address.getAddress();
        int a = ip[0] & 0xff, b = ip[1] & 0xff, c = ip[2] & 0xff, d = ip[3] & 0xff;
        if (a == 172 && b == 20 && c == 10 && d < 16) return true;
        return a == 192 && b == 168 && c == 43;
    }

    private static boolean isWifiInternet(NetworkCapabilities capabilities) {
        return capabilities != null
                && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}
