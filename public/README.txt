7B BCM 2.2.3 Backup Beta

新增：
- 新版 7B 金色羽球 Icon
- Firebase 雲端備份子集合
- Genesis Backup（永久保留）
- 每日第一次開房自動備份
- 每場比賽結束自動備份
- 自動備份僅保留最近 10 份
- 手動備份與 JSON 匯出／匯入
- 備份紀錄與 Backup Health
- 還原前自動建立 Emergency Backup
- Genesis 不可刪除

部署：
1. 將本資料夾完整拖到 Netlify Deploys。
2. Firebase Console → Firestore Database → 規則。
3. 將 FIRESTORE_RULES.txt 全部貼上並按「發布」。
4. 用管理員模式進入房間，開啟「備份」分頁確認 Genesis 已建立。

注意：只部署網站不會清除現有 Firestore 球員或歷史資料。

BCM 2.2.5 更新：
- 「約球投票」改名為「下次球局」
- 新投票在首頁顯示提醒卡片
- 下次球局 Tab 顯示紅點，開啟後消失
- 投票新增「無法參加」選項，且與日期互斥

- 球員卡主拍與備拍改為並排顯示，長文字自動省略，減少卡片高度。


BCM 2.2.6 Pair Queue Beta：
- 勝方兩人留場。
- 候場依兩人一組 FIFO 排隊。
- 隊首兩人上場，敗方兩人排到尾端。
- 四位上場球員完全隨機分隊。
- 奇數候場時，多出的單人優先，並從敗方補一人。

BCM 2.2.7 Voice Names Beta：
- 新增球員『播報名稱』欄位。
- 顯示名稱維持原樣，語音播報改用播報名稱。
- 預設對照：緁→潔、Yoyo→優又、建昱→見育、郁荏→玉刃。
- 適用於比分發球者與下一場叫號。
