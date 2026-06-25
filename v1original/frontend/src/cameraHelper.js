/**
 * 在 Capacitor 原生环境下调用系统相机拍照，返回 File；否则返回 null（降级用文件选择器）
 */
export async function takePhotoWithNativeCamera() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;

    const { Camera } = await import("@capacitor/camera");
    const { CameraSource } = await import("@capacitor/camera");

    const photo = await Camera.getPhoto({
      source: CameraSource.CAMERA,
      quality: 90,
      allowEditing: false,
      resultType: "uri",
    });

    if (!photo?.webPath) return null;

    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const ext = photo.format === "png" ? "png" : "jpg";
    return new File([blob], `photo.${ext}`, { type: blob.type || `image/${ext}` });
  } catch {
    return null;
  }
}
