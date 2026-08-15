# 7B iPhone 循環錄影

獨立於 Android 比分遙控器。錄影時以 10 秒為一段，只保留最近 6 個已完成片段；按下「保存最近 60 秒」後寫入照片。

## 在 Mac 建置

1. 安裝 Xcode 及 XcodeGen。
2. 在此目錄執行 `xcodegen generate`。
3. 開啟 `SevenBLoopRecorder.xcodeproj`，選擇簽署團隊與實機後執行。

iOS 模擬器無法驗證相機，必須使用實體 iPhone。
