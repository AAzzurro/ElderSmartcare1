/**
 * 在 Capacitor 原生环境下使用原生麦克风录音，返回 Blob；否则返回 null（降级用 Web MediaRecorder 或文件选择）
 */
import { Capacitor } from "@capacitor/core";

let VoiceRecorder = null;

async function withTimeout(promise, timeoutMs = 12000) {
  let timerId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error("录音操作超时")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

async function getVoiceRecorder() {
  if (VoiceRecorder) return VoiceRecorder;
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-voice-recorder");
    VoiceRecorder = mod.VoiceRecorder;
    return VoiceRecorder;
  } catch {
    return null;
  }
}

export function canUseNativeVoice() {
  return Capacitor.isNativePlatform();
}

/**
 * 请求麦克风权限并开始录音。返回 true 表示成功，false 表示需降级。
 */
export async function startNativeRecording() {
  const VR = await getVoiceRecorder();
  if (!VR) return false;
  try {
    const perm = await withTimeout(VR.hasAudioRecordingPermission());
    if (!perm?.value) {
      const req = await withTimeout(VR.requestAudioRecordingPermission());
      if (!req?.value) return false;
    }
    const canRecord = await withTimeout(VR.canDeviceVoiceRecord());
    if (!canRecord?.value) return false;
    const started = await withTimeout(VR.startRecording());
    return !!started?.value;
  } catch {
    return false;
  }
}

/**
 * 停止录音并返回 Blob，失败返回 null。
 */
export async function stopNativeRecording() {
  const VR = await getVoiceRecorder();
  if (!VR) return null;
  try {
    const result = await withTimeout(VR.stopRecording());
    const data = result?.value;
    if (!data?.recordDataBase64 || !data?.mimeType) return null;
    const base64 = data.recordDataBase64;
    const mimeType = data.mimeType || "audio/mpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}
