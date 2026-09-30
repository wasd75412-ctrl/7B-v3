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

test('uploads only on the AAA home Wi-Fi',()=>{
  assert.match(wifi,/static final String SSID = "AAA";/);
  assert.match(wifi,/FLAG_INCLUDE_LOCATION_INFO/);
  assert.match(worker,/if \(!HomeWifi\.isConnected\(context\)\) \{[\s\S]*?Status\.WAITING/);
  assert.match(worker,/if \(isStopped\(\) \|\| !HomeWifi\.isConnected\(context\)\) break;/);
  assert.match(scheduler,/NetworkType\.UNMETERED/);
  assert.match(scheduler,/PeriodicWorkRequest\.Builder\(YouTubeUploadWorker\.class, 15, TimeUnit\.MINUTES\)/);
  for(const permission of ['ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION','ACCESS_WIFI_STATE','FOREGROUND_SERVICE_DATA_SYNC'])assert.match(manifest,new RegExp(`android.permission.${permission}`));
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
