import SwiftUI

@main
struct SevenBLoopRecorderApp: App {
    var body: some Scene { WindowGroup { RecorderScreen() } }
}

struct RecorderScreen: View {
    @StateObject private var recorder = RollingRecorder()

    var body: some View {
        ZStack(alignment: .bottom) {
            CameraPreview(session: recorder.session).ignoresSafeArea()
            HStack(spacing: 18) {
                Text(recorder.status).foregroundStyle(.white).font(.headline)
                Spacer()
                Button("保存最近 60 秒") { recorder.saveLastMinute() }
                    .buttonStyle(.borderedProminent).controlSize(.large)
            }
            .padding().background(.black.opacity(0.72))
        }
        .task { await recorder.start() }
        .onDisappear { recorder.stop() }
        .alert("7B 循環錄影", isPresented: $recorder.showAlert) {
            Button("好", role: .cancel) { }
        } message: { Text(recorder.alertMessage) }
    }
}
