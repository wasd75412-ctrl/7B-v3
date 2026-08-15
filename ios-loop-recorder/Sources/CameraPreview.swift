import AVFoundation
import SwiftUI

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewUIView { let view = PreviewUIView(); view.layerView.session = session; return view }
    func updateUIView(_ uiView: PreviewUIView, context: Context) { uiView.layerView.session = session }
}

final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var layerView: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    override init(frame: CGRect) { super.init(frame: frame); layerView.videoGravity = .resizeAspectFill }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}
