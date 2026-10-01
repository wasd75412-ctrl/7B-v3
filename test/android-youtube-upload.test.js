import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../android-remote/app/${path}`,import.meta.url),'utf8');
const javaDir='src/main/java/tw/club7b/scoreremote/';
const manifest=read('src/main/AndroidManifest.xml');
const gradle=read('build.gradle');
const worker=read(`${javaDir}YouTubeUploadWorker.java`);
const uploader=read(`${javaDir}YouTubeUploader.java`);
const scheduler=read(`${javaDir}YouTubeUploadScheduler.java`);
const wifi=read(`${javaDir}HomeWifi.java`);
const activity=read(`${javaDir}MainActivity.java`);
const recordings=read(`${javaDir}RecordingsActivity.java`);
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('uploads when any Wi-Fi is connected',()=>{
  assert.match(wifi,/TRANSPORT_WIFI/);
  assert.match(wifi,/NET_CAPABILITY_VALIDATED/);
  assert.doesNotMatch(wifi,/AAA-5G/);
  assert.match(worker,/if \(!HomeWifi\.isConnected\(context\)\) \{[\s\S]*?等待 Wi-Fi/);
  assert.match(worker,/if \(isStopped\(\) \|\| !HomeWifi\.isConnected\(context\)\) break;/);
  assert.match(scheduler,/NetworkType\.CONNECTED/);
  assert.match(scheduler,/addTransportType\(NetworkCapabilities\.TRANSPORT_WIFI\)/);
  assert.match(scheduler,/ExistingPeriodicWorkPolicy\.UPDATE/);
  assert.match(scheduler,/PeriodicWorkRequest\.Builder\(YouTubeUploadWorker\.class, 15, TimeUnit\.MINUTES\)/);
  assert.match(recordings,/連上 Wi-Fi 自動上傳/);
  assert.doesNotMatch(recordings,/AAA-5G/);
  for(const permission of ['ACCESS_WIFI_STATE','ACCESS_NETWORK_STATE','FOREGROUND_SERVICE_DATA_SYNC'])assert.match(manifest,new RegExp(`android.permission.${permission}`));
  assert.match(manifest,/SystemForegroundService"\s*android:foregroundServiceType="dataSync"/);
});

test('uploads unlisted videos titled by date with the timeline as description',()=>{
  assert.match(uploader,/"privacyStatus", "unlisted"/);
  assert.match(uploader,/uploadType=resumable/);
  assert.match(worker,/entry\.title = RecordingTimeline\.title\(entry\.startMs, RecordingUploadStore\.ordinal\(context, entry\)\);\s*entry\.description = timeline\(entry\);/);
  assert.match(worker,/YouTubeUploader\.createSession\(token, entry\.title, entry\.description, length\)/);
});

test('adds each upload to the 7B羽球社 playlist once',()=>{
  assert.match(uploader,/PLAYLIST_TITLE = "7B羽球社"/);
  assert.match(uploader,/playlists\?part=snippet&mine=true/);
  assert.match(uploader,/playlistItems\?part=snippet/);
  assert.match(worker,/if \(!entry\.playlistAdded\) \{\s*addToPlaylist\(entry, auth\);\s*entry\.playlistAdded = true;/);
});

test('the Android remote opens the native recording upload screen',()=>{
  assert.match(gradle,/androidx\.work:work-runtime/);
  assert.match(gradle,/play-services-auth/);
  assert.match(manifest,/android:name="\.RecordingsActivity"/);
  assert.match(activity,/public void openRecordings\(\)[\s\S]*?RecordingsActivity\.class/);
  assert.match(activity,/YouTubeUploadScheduler\.scheduleIfPending\(this\)/);
  assert.match(recordings,/"複製時間軸"/);
  assert.match(index,/id="androidRemoteOpenRecordings" class="btn hidden"/);
  assert.match(main,/\$\('androidRemoteOpenRecordings'\)\.classList\.toggle\('hidden',typeof window\.BcmAndroid\?\.openRecordings!=='function'\)/);
  assert.match(main,/window\.BcmAndroid\?\.openRecordings\?\.\(\)/);
});
