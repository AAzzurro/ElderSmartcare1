import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { Button, Modal as AntModal, TextArea as AntTextArea } from "antd-mobile";
import { Mic, Loader2 } from "lucide-react";
import "antd-mobile/es/global";

const MIN_RECORD_MS = 800;
/** 聊天底栏统一高度（与输入框、按钮对齐） */
export const CHAT_TOOLBAR_HEIGHT = 38;

function base64ToBlob(base64, mimeType = "audio/aac") {
  if (!base64 || typeof base64 !== "string") return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "audio/aac" });
  } catch {
    return null;
  }
}

export function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

export function MobileShell({ children }) {
  return (
    <div className="min-h-dvh bg-gray-50 md:bg-gray-200 md:px-4 md:py-6">
      <div className="mx-auto min-h-dvh w-full bg-gray-50 md:max-w-md md:min-h-[calc(100dvh-3rem)] md:shadow-2xl md:overflow-x-hidden md:relative md:rounded-[28px] md:ring-1 md:ring-black/5">
        {children}
      </div>
    </div>
  );
}

export function Modal({ open, title, description, onClose, customActions }) {
  if (!open) return null;
  return (
    <AntModal
      visible={open}
      onClose={onClose}
      closeOnMaskClick
      bodyStyle={{
        padding: "20px 16px 16px",
        borderRadius: 24,
        fontSize: 18,
      }}
      content={
        <div className="space-y-4">
          <div className="text-2xl md:text-3xl font-bold text-gray-900 text-center">{title}</div>
          <div className="mt-1 text-lg md:text-2xl text-gray-700 text-center">{description}</div>
          <div className="mt-3">
            {customActions ? customActions : <PrimaryButton onClick={onClose}>我知道了</PrimaryButton>}
          </div>
        </div>
      }
    />
  );
}

export function TopBar({ title, onBack, right }) {
  return (
    <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur border-b border-gray-200">
      <div className="px-4 py-4 flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-11 px-4 rounded-2xl bg-[#2F74B8] text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-1.5 font-medium text-lg"
            aria-label="返回"
          >
            <span className="text-xl">←</span>
            <span>返回</span>
          </button>
        ) : (
          <div className="h-11 w-0" />
        )}
        <div className="flex-1">
          <div className="text-3xl font-bold text-gray-900">{title}</div>
        </div>
        <div className="min-w-[44px] flex justify-end">{right}</div>
      </div>
    </div>
  );
}

export function TabBar({ tabs, active, onChange, size = "base" }) {
  const textSize = size === "lg" ? "text-2xl" : "text-xl";
  return (
    <div className="px-4 pb-3">
      <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={classNames(
                "whitespace-nowrap px-4 py-2 rounded-xl transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95",
                textSize,
                isActive
                  ? "bg-[#2F74B8] text-white"
                  : "bg-[#E3F0FA] text-[#2F74B8] active:bg-[#D4E6F4]"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div
      className={classNames(
        "bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-6 backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
  ...props
}) {
  const baseStyle =
    "relative w-full overflow-hidden font-extrabold text-2xl rounded-full py-5 transition-all duration-300 flex items-center justify-center gap-3 active:scale-95";

  const variants = {
    primary:
      "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50",
    secondary:
      "bg-white text-blue-600 border-2 border-blue-50 shadow-sm",
    photo:
      "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50",
    submit:
      "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/40 hover:shadow-blue-600/60",
  };

  const resolvedVariant =
    variant === "ghost" ? "secondary" : variant in variants ? variant : "primary";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        baseStyle,
        variants[resolvedVariant],
        disabled ? "opacity-60 saturate-50 cursor-not-allowed scale-100" : "",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function VoiceRecorderButton({
  onRecorded,
  onRecordTooShort,
  labelIdle = "开始录音",
  labelRecording = "停止录音",
  labelProcessing = "处理中...",
  onFallbackClick,
  compact = false,
  className = "",
  isExternalProcessing = false,
}) {
  const [status, setStatus] = useState("idle"); // idle | recording | processing | unsupported
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (status !== "processing") return undefined;
    const timer = setTimeout(() => setStatus((prev) => (prev === "processing" ? "idle" : prev)), 15000);
    return () => clearTimeout(timer);
  }, [status]);

  const startNativeRecording = async () => {
    const perm = await VoiceRecorder.requestAudioRecordingPermission();
    if (!perm?.value) return false;
    const can = await VoiceRecorder.canDeviceVoiceRecord();
    if (!can?.value) return false;
    const started = await VoiceRecorder.startRecording();
    return !!started?.value;
  };

  const deliverRecording = async (blob, msDuration) => {
    if (msDuration < MIN_RECORD_MS && onRecordTooShort) {
      onRecordTooShort();
      setStatus("idle");
      return;
    }
    if (blob && blob.size > 0 && onRecorded) {
      setStatus("processing");
      try {
        await Promise.resolve(onRecorded(blob));
      } finally {
        setStatus("idle");
      }
      return;
    }
    setStatus("idle");
  };

  const stopNativeRecording = async () => {
    const result = await VoiceRecorder.stopRecording();
    const value = result?.value;
    if (!value) {
      setStatus("idle");
      return;
    }
    const mimeType = value.mimeType || "audio/aac";
    const blob = base64ToBlob(value.recordDataBase64, mimeType);
    const msDuration = value.msDuration ?? 0;
    await deliverRecording(blob, msDuration);
  };

  const ensureWebSupport = () => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setStatus("unsupported");
    }
  };

  const startWebRecording = async () => {
    if (
      !navigator.mediaDevices ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setStatus("unsupported");
      if (onFallbackClick) onFallbackClick();
      return;
    }
    try {
      setStatus("processing");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mr = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await deliverRecording(blob, blob.size > 0 ? MIN_RECORD_MS + 1 : 0);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setStatus("recording");
    } catch (e) {
      console.error("startRecording error", e);
      setStatus("unsupported");
      if (onFallbackClick) onFallbackClick();
    }
  };

  const handleStart = async () => {
    if (status === "recording" || status === "processing") return;

    if (isNative) {
      try {
        setStatus("processing");
        const ok = await startNativeRecording();
        if (ok) setStatus("recording");
        else setStatus("idle");
      } catch (e) {
        console.warn("Native recording start failed:", e);
        setStatus("idle");
      }
      return;
    }
    ensureWebSupport();
    if (status === "unsupported") {
      if (onFallbackClick) onFallbackClick();
      return;
    }
    await startWebRecording();
  };

  const handleStop = async () => {
    if (status !== "recording") return;

    if (isNative) {
      try {
        setStatus("processing");
        await stopNativeRecording();
      } catch (e) {
        console.warn("Native recording stop failed:", e);
        setStatus("idle");
      }
      return;
    }
    const mr = mediaRecorderRef.current;
    if (mr?.state === "recording") {
      setStatus("processing");
      mr.stop();
    }
  };

  const showProcessing = status === "processing" || isExternalProcessing;

  const label =
    status === "recording"
      ? labelRecording
      : showProcessing
        ? labelProcessing
        : labelIdle;

  const compactBtnClass = classNames(
    "h-[38px] w-[38px] min-w-[38px] flex-shrink-0 rounded-lg p-0",
    "inline-flex items-center justify-center",
    "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm",
    "transition-all duration-200 active:scale-95",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    status === "recording" ? "animate-pulse ring-2 ring-blue-400/70" : "",
    className
  );

  const handleClick = () => {
    if (showProcessing) return;
    if (status === "idle") handleStart();
    else if (status === "recording") handleStop();
    else if (status === "unsupported" && onFallbackClick) onFallbackClick();
  };

  if (compact) {
    return (
      <button
        type="button"
        className={compactBtnClass}
        onClick={handleClick}
        disabled={showProcessing}
        aria-label={label}
      >
        {showProcessing ? (
          <Loader2 className="w-[18px] h-[18px] text-white animate-spin" strokeWidth={2.5} />
        ) : (
          <Mic className="w-[18px] h-[18px] text-white block" strokeWidth={2.5} />
        )}
      </button>
    );
  }

  return (
    <Button
      color="primary"
      size="large"
      shape="rounded"
      block
      className={classNames(
        "mt-1 !h-auto !rounded-full !py-5 !text-2xl font-extrabold flex items-center justify-center gap-3 transition-all duration-300 active:scale-95",
        "!bg-gradient-to-r !from-blue-500 !to-indigo-500 !text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50",
        status === "recording" ? "animate-pulse ring-2 ring-blue-400/70" : "",
        className
      )}
      onClick={handleClick}
      disabled={showProcessing}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {showProcessing ? (
          <Loader2 className="w-7 h-7 text-white animate-spin" />
        ) : (
          <Mic className="w-7 h-7 text-white" />
        )}
        <span className="leading-tight">{label}</span>
      </span>
    </Button>
  );
}

export function TextArea({ label, placeholder, rows = 3, value, onChange, compact = false }) {
  const toolbarHeight = CHAT_TOOLBAR_HEIGHT;
  return (
    <div className={compact ? "flex-1 min-w-0" : ""}>
      {label && !compact ? (
        <div className="text-xl font-semibold text-gray-800 mb-2">{label}</div>
      ) : null}
      <AntTextArea
        rows={compact ? 1 : rows}
        value={value}
        placeholder={placeholder}
        autoSize={compact ? { minRows: 1, maxRows: 4 } : { minRows: rows, maxRows: rows + 2 }}
        style={{
          borderRadius: compact ? 8 : 20,
          fontSize: compact ? 16 : 18,
          lineHeight: compact ? "22px" : undefined,
          minHeight: compact ? toolbarHeight : undefined,
          padding: compact ? "7px 10px" : "12px 14px",
          backgroundColor: compact ? "#ffffff" : "#f5f5f5",
          boxShadow: compact ? "none" : "0 8px 30px rgba(0,0,0,0.06)",
          border: compact ? "1px solid #e5e5e5" : undefined,
        }}
        onChange={(val) => {
          if (onChange) {
            // 模拟原来的 event 结构：e.target.value
            onChange({ target: { value: val } });
          }
        }}
      />
    </div>
  );
}

export function StatusPill({ text, tone = "neutral" }) {
  const toneClass =
    tone === "success"
      ? "bg-blue-50 text-blue-800 border-blue-100"
      : tone === "danger"
        ? "bg-rose-50 text-rose-800 border-rose-100"
        : "bg-gray-100/0 text-gray-700 border-gray-200";

  return (
    <div
      className={classNames(
        "w-full rounded-2xl border px-4 py-3 text-center text-2xl font-semibold shadow-md",
        toneClass
      )}
    >
      {text}
    </div>
  );
}

export function SectionTitle({ children, size = "base" }) {
  const cls = size === "xl" ? "text-3xl font-bold" : "text-2xl font-bold";
  return <div className={classNames(cls, "text-gray-900 text-center")}>{children}</div>;
}

export function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="加载中">
      <span className="h-2 w-2 rounded-full bg-white/90 animate-bounce [animation-delay:-0.2s]" />
      <span className="h-2 w-2 rounded-full bg-white/90 animate-bounce [animation-delay:-0.1s]" />
      <span className="h-2 w-2 rounded-full bg-white/90 animate-bounce" />
    </span>
  );
}

