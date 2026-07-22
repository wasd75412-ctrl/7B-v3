# 7B Android 比分遙控器

這個 Android App 讓藍牙快門遙控器控制 7B 羽球社比分：

- 短按音量＋：A 隊加一分
- 短按音量－：B 隊加一分
- 長按任一按鍵：撤銷上一分

## 首次使用

1. 安裝並開啟 App。
2. 點「前往開啟按鍵權限」。
3. 在 Android 設定中選擇「7B 比分遙控器按鍵存取」並開啟允許。
4. 回到 App，連接球局並登入管理員。

## 錄影計分模式

登入球局後，點「開啟相機錄影」。App 會先保存目前房號、管理員權限與比賽規則，再切到 Android 相機。錄影期間按鍵存取服務會直接寫入獨立即時比分，不依賴背景中的網頁，因此其他手機與 iPad 會立即收到更新，也不會調整音量或中斷錄影。錄影完成並回到 App 後，可點「關閉錄影計分」恢復一般音量鍵行為。

按鍵存取服務只攔截支援的遙控器按鍵，不讀取畫面內容。一般模式只有 App 顯示在前景時才會轉為計分；錄影計分模式則會在相機位於前景時繼續接收，直到返回 App 關閉此模式。

App 使用和主網站相同的房號、管理員登入與 Firebase 即時資料，所以 Android 手機和 iPad 會同步比分；若背景同步失敗，相機畫面上會以短訊息提示原因。

## 本機建置

使用 Android Studio 內附的 JDK：

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

正式簽署資訊只存放在本機或 GitHub Actions Secrets；`keystore.properties` 和 `signing/` 不會加入 Git。
