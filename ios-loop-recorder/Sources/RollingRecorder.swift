import AVFoundation
import Photos

final class RollingRecorder: NSObject, ObservableObject, AVCaptureFileOutputRecordingDelegate {
    let session = AVCaptureSession()
    @Published var status = "相機準備中…"
    @Published var showAlert = false
    @Published var alertMessage = ""
    private let output = AVCaptureMovieFileOutput()
    private let work = DispatchQueue(label: "tw.club7b.loop-recorder")
    private var timer: DispatchSourceTimer?
    private var clips: [URL] = []
    private var closing = false
    private var saveAfterFinalize = false

    func start() async {
        let camera = await AVCaptureDevice.requestAccess(for: .video)
        guard camera else { present("需要允許相機權限。") ; return }
        _ = await AVCaptureDevice.requestAccess(for: .audio)
        work.async { [weak self] in self?.configureAndStart() }
    }

    nonisolated private func configureAndStart() {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        defer { session.commitConfiguration() }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let cameraInput = try? AVCaptureDeviceInput(device: camera), session.canAddInput(cameraInput) else {
            present("無法啟動後方相機。") ; return
        }
        session.addInput(cameraInput)
        if let mic = AVCaptureDevice.default(for: .audio), let micInput = try? AVCaptureDeviceInput(device: mic), session.canAddInput(micInput) { session.addInput(micInput) }
        guard session.canAddOutput(output) else { present("裝置不支援影片輸出。") ; return }
        session.addOutput(output)
        session.startRunning()
        startClip()
    }

    nonisolated private func startClip() {
        guard !closing, !output.isRecording else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("7b-\(UUID().uuidString).mov")
        output.startRecording(to: url, recordingDelegate: self)
        DispatchQueue.main.async { self.status = "● 循環錄影中 · 僅暫存最近 60 秒" }
        timer?.cancel()
        let next = DispatchSource.makeTimerSource(queue: work)
        next.schedule(deadline: .now() + 10)
        next.setEventHandler { [weak self] in self?.output.stopRecording() }
        timer = next; next.resume()
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        work.async { [weak self] in
            guard let self else { return }
            if error == nil {
                clips.append(url)
                while clips.count > 6 { try? FileManager.default.removeItem(at: clips.removeFirst()) }
            } else { try? FileManager.default.removeItem(at: url) }
            if saveAfterFinalize { saveAfterFinalize = false; DispatchQueue.main.async { self.persistClips() } }
            startClip()
        }
    }

    func saveLastMinute() {
        work.async { [weak self] in
            guard let self else { return }
            if output.isRecording { saveAfterFinalize = true; output.stopRecording() }
            else { DispatchQueue.main.async { self.persistClips() } }
        }
    }

    private func persistClips() {
        let snapshot = work.sync { clips }
        guard !snapshot.isEmpty else { present("第一段仍在錄製，請稍候。") ; return }
        Task {
            let allowed = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard allowed == .authorized || allowed == .limited else { present("需要允許加入照片的權限。") ; return }
            do {
                try await PHPhotoLibrary.shared().performChanges {
                    snapshot.forEach { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: $0) }
                }
                present("已保存 \(snapshot.count) 個連續片段到照片。")
            } catch { present("保存失敗：\(error.localizedDescription)") }
        }
    }

    func stop() {
        work.async { [weak self] in
            guard let self else { return }; closing = true; timer?.cancel()
            if output.isRecording { output.stopRecording() }
            session.stopRunning()
        }
    }

    private func present(_ message: String) {
        DispatchQueue.main.async { self.alertMessage = message; self.showAlert = true }
    }
}
