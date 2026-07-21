# 7B Android 比分遙控器

這個 Android App 將藍牙快門遙控器產生的音量鍵轉為 7B 比分操作：

- 短按音量＋：A 隊加一分
- 短按音量－：B 隊加一分
- 按住任一音量鍵：撤銷上一分

App 必須保持在前景；手機會保持螢幕亮起，比分經現有 Firebase 房間同步至 iPad。

## 本機建置

以 Android Studio 開啟本資料夾，或執行：

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

正式版簽署設定放在未納入 Git 的 `keystore.properties` 與 `signing/` 資料夾。
