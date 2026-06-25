import { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  AlertCircle,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardList,
  Mic,
  Pill,
  ArrowLeft,
  RotateCcw,
  Stethoscope,
  SunMedium,
  MoonStar,
  Soup,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Card,
  LoadingDots,
  Modal,
  PrimaryButton,
  SectionTitle,
  StatusPill,
  TextArea,
  TopBar,
  VoiceRecorderButton,
  classNames,
} from "../ui";
import {
  fetchAddMedicine,
  fetchChat,
  fetchCheckDrugInteractions,
  fetchElderAudio,
  fetchOcr,
  fetchSchedules,
  fetchTranscribe,
  fetchTts,
  fetchDeleteMedicine,
  fetchElderToggleTakenSlot,
  fetchBoxImage,
  fetchAddEvent,
} from "../apiClient";
import { addRemindersToCalendar, downloadIcsReminder } from "../calendarHelper";
import { getCareGroupId } from "../apiClient";

const ELDER_MODES = {
  home: "home",
  ocrInput: "ocrInput",
  ocrResult: "ocrResult",
  reminder: "reminder",
  chat: "chat",
};

function ElderQrCard() {
  const elderName =
    (typeof window !== "undefined" && window.localStorage.getItem("currentElderName")) ||
    "";
  const careGroupId = getCareGroupId();
  const [open, setOpen] = useState(false);

  if (!elderName) return null;

  const payload = JSON.stringify({
    type: "elder-bind",
    elderName,
    careGroupId,
  });

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/70 shadow-[0_4px_16px_rgba(15,23,42,0.08)] border border-white/60 text-sm font-semibold text-[#2F74B8] active:scale-95 transition-all"
      >
        <span>查看/出示老人二维码名片</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <Card className="mt-3 text-center">
          <div className="text-base font-semibold text-gray-800 mb-2">
            老人名片（扫一扫绑定我）
          </div>
          <div className="inline-block bg-white p-3 rounded-2xl shadow-sm">
            <QRCodeCanvas value={payload} size={160} />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            老人姓名：{elderName}｜ID：{careGroupId}
          </div>
        </Card>
      )}
    </div>
  );
}

// ========== OCR Input Step ==========
function ElderOcrInputSection({ onResult, onBack }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const fileInputRef = useRef(null);

  const openCamera = async () => {
    // 完全仿照「拍摄药盒」：永远走 input capture，点击即拉起拍照（不出现“相册/拍照”选择）
    fileInputRef.current?.click();
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setSelectedFile(file);
    try {
      const url = URL.createObjectURL(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewUrl("");
    }
  };

  const onSubmit = async () => {
    if (!selectedFile) {
      setModal({
        open: true,
        title: "还差一步",
        description: "请先点击上方蓝色按钮拍照药品说明书。",
      });
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchOcr({ imageFile: selectedFile, text: "" });
      const nextSummary = data?.summary || "";
      const nextName = data?.name || "";
      const nextDosage = data?.dosage || "";
      const nextContra = data?.contra || "";
      const nextTimeList = Array.isArray(data?.time) ? data.time : [];
      const nextCustomTime = data?.custom_time || "";

      if (onResult) {
        onResult({
          summary: nextSummary,
          name: nextName,
          dosage: nextDosage,
          contra: nextContra,
          timeList: nextTimeList,
          customTime: nextCustomTime,
        });
      }
    } catch (err) {
      const isAbort =
        err?.name === "AbortError" || String(err?.message || "").includes("aborted");
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: isAbort
          ? "请求超时了，请检查后端是否已启动，然后重试。"
          : "请求失败了，请检查网络或稍后重试。",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/50 pb-20">
      {onBack && (
        <div className="px-4 py-4 border-b border-gray-200">
          <PrimaryButton
            variant="secondary"
            onClick={onBack}
            className="w-auto px-6 py-3 text-2xl font-semibold bg-blue-50 text-blue-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="w-6 h-6" />
              <span>返回首页</span>
            </span>
          </PrimaryButton>
        </div>
      )}
      <div className="px-4 pt-4 pb-10 space-y-4">
        <Modal
          open={modal.open}
          title={modal.title}
          description={modal.description}
          onClose={() => setModal((m) => ({ ...m, open: false }))}
        />

        <SectionTitle size="xl">识别药品说明书</SectionTitle>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickFile}
        />
        <PrimaryButton variant="photo" onClick={openCamera} disabled={isLoading}>
          <span className="flex items-center justify-center gap-3">
            <Camera className="w-8 h-8 text-white" />
            <span>点击拍照</span>
          </span>
        </PrimaryButton>

        {previewUrl ? (
          <div className="mt-4 flex justify-center">
            <img
              src={previewUrl}
              alt="已拍摄药品说明书"
              className="max-h-64 rounded-2xl shadow-md border border-gray-200 object-contain"
            />
          </div>
        ) : null}

        <PrimaryButton
          variant="submit"
          onClick={onSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-3">
              <span>正在拼命阅读说明书</span>
              <LoadingDots />
            </span>
          ) : (
            "提交给AI进行检测"
          )}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ========== OCR Result Step ==========
function ElderOcrResultSection({ ocrResult, onAddMedicine, onBack, currentElderly }) {
  const [summary, setSummary] = useState(ocrResult?.summary || "");
  const [name, setName] = useState(ocrResult?.name || "");
  const [dosage, setDosage] = useState(ocrResult?.dosage || "");
  const [contra, setContra] = useState(ocrResult?.contra || "");
  const [timeList, setTimeList] = useState(ocrResult?.timeList || []);
  const [customTime, setCustomTime] = useState(ocrResult?.customTime || "");
  const [isAdding, setIsAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [audioFile, setAudioFile] = useState(null);
  const [boxImageFile, setBoxImageFile] = useState(null);
  const [ttsLoadingKey, setTtsLoadingKey] = useState("");
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const boxImageInputRef = useRef(null);

  const [interactionWarning, setInteractionWarning] = useState({
    open: false,
    interactions: [],
    aiWarning: "",
    hasConfirmed: false,
  });

  const [duplicateWarning, setDuplicateWarning] = useState({
    open: false,
    duplicates: [],
    message: "",
    hasConfirmed: false,
  });

  const [checkingPhase, setCheckingPhase] = useState("none"); // "none" | "conflict" | "duplicate"
  const [detailedInfoOpen, setDetailedInfoOpen] = useState(false);

  const doAdd = async () => {
    setIsAdding(true);
    setAddMsg("");
    try {
      const data = await fetchAddMedicine({
        bedNo: "",
        residentName: currentElderly,
        name,
        dosage,
        contra,
        timeList,
        customTime,
        audioFile,
        boxImageFile,
      });
      setAddMsg(data?.message || "已加入用药排班。");
      // 重置相互作用和重复用药确认标志
      setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
      setDuplicateWarning({ open: false, duplicates: [], message: "", hasConfirmed: false });

      // 发送事件给家属端
      try {
        await fetchAddEvent({
          residentName: currentElderly,
          eventType: "add_medicine",
          title: `添加了"${name}"`,
          description: dosage || "",
          isUrgent: false,
          chatContent: "",
        });
      } catch (err) {
        console.error("发送事件失败（不影响用户操作）:", err);
      }

      setTimeout(() => {
        onAddMedicine();
      }, 500);
    } catch {
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: "加入用药排班失败，请稍后重试。",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const onAdd = async () => {
    if (!name) {
      setModal({
        open: true,
        title: "还没有药品信息",
        description: "请先完成一次 AI 检测，确认药品名称后再加入用药卡片。",
      });
      return;
    }

    // 如果已经在弹窗中确认过重复风险，直接执行保存逻辑，避免重复检查
    if (duplicateWarning.hasConfirmed) {
      await doAdd();
      return;
    }

    setIsAdding(true);
    setCheckingPhase("duplicate");

    let hasDuplicate = false;
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const schedules = await fetchSchedules();
      const normalizedNewName = String(name || "").trim().toLowerCase();
      const duplicates = (schedules || [])
        .filter((row) => {
          // 只检查同一个老人的重复用药
          const rowName = String(row["姓名"] || "").trim();
          if (rowName !== currentElderly) return false;
          const existingName = String(row["药品名称"] || row["name"] || "").trim().toLowerCase();
          return existingName && existingName === normalizedNewName;
        })
        .map((row) => row["药品名称"] || row["name"]);

      if (duplicates.length > 0) {
        hasDuplicate = true;
        setDuplicateWarning({
          open: true,
          duplicates,
          message: "检测到重复用药。请在医生指导下服用。",
          hasConfirmed: false,
        });
      }
    } catch (err) {
      console.error("检查重复用药失败:", err);
      // 失败时不阻止流程，继续检测冲突
    }

    if (hasDuplicate) {
      setCheckingPhase("none");
      setIsAdding(false);
      return;
    }

    // 检测冲突用药
    setCheckingPhase("conflict");
    try {
      const result = await fetchCheckDrugInteractions({
        name,
        dosage,
        contra,
        bedNo: "",
        residentName: currentElderly,
      });

      if (result?.has_interactions) {
        setInteractionWarning({
          open: true,
          interactions: result.interactions || [],
          aiWarning: result.ai_warning || "",
          hasConfirmed: false,
        });

        // 发送冲突警告事件给家属端
        try {
          const conflictDesc = result.interactions
            ?.map((i) => `${i.existing_drug}(${i.risk_level})`)
            .join("、") || "未知冲突";

          await fetchAddEvent({
            residentName: currentElderly,
            eventType: "drug_conflict",
            title: `"${name}"与已用药有冲突`,
            description: `冲突药物：${conflictDesc}`,
            isUrgent: true,  // 冲突警告是紧急的（红色）
            chatContent: "",
          });
        } catch (err) {
          console.error("发送冲突事件失败（不影响用户操作）:", err);
        }

        return;
      }

      // 无重复、无冲突，直接添加
      await doAdd();
    } catch (err) {
      console.error("检查相互作用失败:", err);
      // 如果检查失败也继续添加，避免卡住
      await doAdd();
    } finally {
      setIsAdding(false);
      setCheckingPhase("none");
    }
  };

  const onConfirmInteraction = () => {
    // 用户确认了相互作用警告，关闭弹窗并直接执行添加逻辑
    setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
    // 直接调用doAdd，避免再次检查
    doAdd();
  };

  const onCancelInteraction = () => {
    // 用户取消了，关闭弹窗，不执行添加
    setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
  };

  const checkConflictAndAdd = async () => {
    // 用户在重复警告中确认继续添加，跳过重复检测，进入冲突检测
    setDuplicateWarning({ open: false, duplicates: [], message: "", hasConfirmed: false });
    setIsAdding(true);
    setCheckingPhase("conflict");
    try {
      const result = await fetchCheckDrugInteractions({
        name,
        dosage,
        contra,
        bedNo: "",
        residentName: currentElderly,
      });

      if (result?.has_interactions) {
        setInteractionWarning({
          open: true,
          interactions: result.interactions || [],
          aiWarning: result.ai_warning || "",
          hasConfirmed: false,
        });

        // 发送冲突警告事件给家属端
        try {
          const conflictDesc = result.interactions
            ?.map((i) => `${i.existing_drug}(${i.risk_level})`)
            .join("、") || "未知冲突";

          await fetchAddEvent({
            residentName: currentElderly,
            eventType: "drug_conflict",
            title: `"${name}"与已用药有冲突`,
            description: `冲突药物：${conflictDesc}`,
            isUrgent: true,  // 冲突警告是紧急的（红色）
            chatContent: "",
          });
        } catch (err) {
          console.error("发送冲突事件失败（不影响用户操作）:", err);
        }

        return;
      }

      // 无冲突，直接添加
      await doAdd();
    } catch (err) {
      console.error("检查相互作用失败:", err);
      // 检查失败也继续添加，避免卡住
      await doAdd();
    } finally {
      setIsAdding(false);
      setCheckingPhase("none");
    }
  };

  const onPickAudioNote = () => fileInputRef.current?.click();

  const onRecordedNote = async (blob) => {
    const file = new File([blob], "note.webm", { type: blob.type || "audio/webm" });
    setAudioFile(file);
  };

  const playTts = async (text, key) => {
    if (!text) return;
    setTtsLoadingKey(key);
    try {
      const url = await fetchTts(text);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => { });
      }
    } finally {
      setTtsLoadingKey("");
    }
  };

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />

      {/* 检测阶段弹窗（冲突 -> 重复） */}
      {checkingPhase !== "none" && (
        <Modal
          open={true}
          title={checkingPhase === "conflict" ? "正在检测用药冲突" : "正在检测重复用药"}
          description={
            <span className="inline-flex items-center justify-center gap-1.5" aria-label="加载中">
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.2s]" />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.1s]" />
              <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
            </span>
          }
          customActions={<></>}
        />
      )}

      {/* 药物相互作用警告弹窗 */}
      {interactionWarning.open && (
        <Modal
          open={true}
          title={
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-7 h-7 text-red-600" />
              <span>检测到用药冲突风险！</span>
            </span>
          }
          description={
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {interactionWarning.interactions?.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="font-semibold text-red-700 mb-2">已知相互作用（执行交叉检查）</div>
                  <ul className="space-y-2">
                    {interactionWarning.interactions.map((interaction, idx) => (
                      <li key={idx} className="text-lg text-red-700">
                        <div className="font-semibold">
                          {interaction.existing_drug}
                          <span
                            className={`ml-2 px-2 py-1 rounded text-base font-bold ${interaction.risk_level === "严重"
                              ? "bg-red-600 text-white"
                              : interaction.risk_level === "中度"
                                ? "bg-orange-600 text-white"
                                : "bg-yellow-600 text-white"
                              }`}
                          >
                            {interaction.risk_level}
                          </span>
                        </div>
                        <div className="mt-1">{interaction.description}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {interactionWarning.aiWarning && (
                <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                  <div className="font-semibold text-orange-700 mb-2 inline-flex items-center gap-2">
                    <Bot className="w-6 h-6 text-orange-600" />
                    <span>AI 专业分析与建议</span>
                  </div>
                  <div className="text-lg text-orange-700 whitespace-pre-wrap">
                    {interactionWarning.aiWarning}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <div className="text-lg text-blue-700">
                  如果您仍然需要添加此药物，请确保已咨询医生或药师，并完全理解上述风险。
                </div>
              </div>
            </div>
          }
          onClose={onCancelInteraction}
          customActions={
            <div className="flex gap-3 mt-4">
              <button
                onClick={onCancelInteraction}
                className="flex-1 px-4 py-3 rounded-2xl font-semibold text-gray-700 bg-gray-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-gray-300 transition-all active:scale-95"
              >
                <span className="inline-flex items-center gap-2">
                  <XCircle className="w-6 h-6" />
                  <span>取消添加，重新检查</span>
                </span>
              </button>
              <button
                onClick={onConfirmInteraction}
                className="flex-1 px-4 py-3 rounded-2xl font-semibold text-white bg-red-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-red-700 transition-all active:scale-95"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="w-6 h-6" />
                  <span>我已确认风险，继续添加</span>
                </span>
              </button>
            </div>
          }
        />
      )}

      {/* 重复用药警告弹窗 */}
      {duplicateWarning.open && (
        <Modal
          open={true}
          title={
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-7 h-7 text-amber-500" />
              <span>检测到可能重复用药</span>
            </span>
          }
          description={
            <div className="space-y-3">
              <div className="text-lg text-gray-700">
                {duplicateWarning.message}
              </div>
              {duplicateWarning.duplicates?.length > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <div className="font-semibold text-yellow-700 mb-2">已存在的相似用药</div>
                  <ul className="text-lg text-yellow-700 list-disc list-inside space-y-1">
                    {duplicateWarning.duplicates.map((name, idx) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
          onClose={() => setDuplicateWarning({ open: false, duplicates: [], message: "", hasConfirmed: false })}
          customActions={
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setDuplicateWarning({ open: false, duplicates: [], message: "", hasConfirmed: false })}
                className="flex-1 px-6 py-3 rounded-2xl font-semibold text-2xl text-gray-700 bg-gray-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-gray-300 transition-all active:scale-95"
              >
                <span className="inline-flex items-center gap-2">
                  <XCircle className="w-6 h-6" />
                  <span>取消添加</span>
                </span>
              </button>
              <button
                onClick={checkConflictAndAdd}
                className="flex-1 px-2 py-3 rounded-2xl font-semibold text-2xl text-white bg-red-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-red-700 transition-all active:scale-95"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="w-6 h-6" />
                  <span>无视风险，继续添加</span>
                </span>
              </button>
            </div>
          }
        />
      )}

      <audio ref={audioRef} className="hidden" />

      <SectionTitle size="xl">智能解析药品信息</SectionTitle>

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="w-7 h-7 text-blue-600" />
                <span>智能概括</span>
              </span>
            </SectionTitle>
            <button
              type="button"
              className="text-sm text-blue-600 font-semibold px-3 py-1 rounded-full bg-blue-50 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
              disabled={!summary || ttsLoadingKey === "summary"}
              onClick={() => playTts(summary, "summary")}
            >
              {ttsLoadingKey === "summary" ? "朗读中..." : "朗读"}
            </button>
          </div>
          <TextArea
            placeholder="（这里显示 AI 概括结果，可手动修改）"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setDetailedInfoOpen(!detailedInfoOpen)}
            className="px-6 py-2 rounded-full font-semibold text-white bg-blue-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-blue-700 active:scale-95 transition-all"
          >
            {detailedInfoOpen ? (
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="w-6 h-6" />
                <span>收起详细信息</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <ClipboardList className="w-6 h-6" />
                <span>展开详细信息</span>
              </span>
            )}
          </button>
        </div>
      </Card>

      {detailedInfoOpen && (
        <Card>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-semibold text-gray-800">药品名称</div>
                <button
                  type="button"
                  className="text-sm text-blue-600 font-semibold px-3 py-1 rounded-full bg-blue-50 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                  disabled={!name || ttsLoadingKey === "name"}
                  onClick={() => playTts(name, "name")}
                >
                  {ttsLoadingKey === "name" ? "朗读中..." : "朗读"}
                </button>
              </div>
              <input
                className="w-full bg-stone-100 rounded-2xl shadow-md hover:shadow-lg transition-shadow p-4 text-2xl text-gray-900 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="（自动填充，可手动修改）"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-semibold text-gray-800">用法用量</div>
                <button
                  type="button"
                  className="text-sm text-blue-600 font-semibold px-3 py-1 rounded-full bg-blue-50 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                  disabled={!dosage || ttsLoadingKey === "dosage"}
                  onClick={() => playTts(dosage, "dosage")}
                >
                  {ttsLoadingKey === "dosage" ? "朗读中..." : "朗读"}
                </button>
              </div>
              <TextArea
                placeholder="（自动填充，可手动修改）"
                rows={3}
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-semibold text-gray-800">
                  服用禁忌
                </div>
                <button
                  type="button"
                  className="text-sm text-blue-600 font-semibold px-3 py-1 rounded-full bg-blue-50 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                  disabled={!contra || ttsLoadingKey === "contra"}
                  onClick={() => playTts(contra, "contra")}
                >
                  {ttsLoadingKey === "contra" ? "朗读中..." : "朗读"}
                </button>
              </div>
              <TextArea
                placeholder="（自动填充，可手动修改）"
                rows={3}
                value={contra}
                onChange={(e) => setContra(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-3">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Bot className="w-7 h-7 text-blue-600" />
              <span>AI推断服药时间</span>
            </span>
          </SectionTitle>
          <div className="flex flex-wrap gap-2">
            {(Array.isArray(timeList) && timeList.length > 0
              ? timeList
              : []
            ).map((x) => (
              <span
                key={x}
                className="px-3 py-2 rounded-2xl text-xl font-semibold bg-gray-200 text-gray-800 shadow-md"
              >
                <span className="inline-flex items-center gap-2">
                  {x.includes("早餐") ? (
                    <SunMedium className="w-5 h-5 text-amber-500" />
                  ) : x.includes("午餐") ? (
                    <SunMedium className="w-5 h-5 text-yellow-500" />
                  ) : x.includes("晚餐") ? (
                    <Soup className="w-5 h-5 text-orange-500" />
                  ) : x.includes("睡前") ? (
                    <MoonStar className="w-5 h-5 text-indigo-500" />
                  ) : null}
                  <span>{x}</span>
                </span>
              </span>
            ))}
            {(!Array.isArray(timeList) || timeList.length === 0) && (
              <span className="text-gray-500 text-xl">未推断</span>
            )}
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-800 mb-2">
              特殊用药时间说明
            </div>
            <TextArea
              placeholder="暂无特殊用药时间"
              rows={2}
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <SectionTitle size="xl">
            <span className="inline-flex items-center gap-2">
              <Mic className="w-7 h-7 text-blue-600" />
              <span>语音备注</span>
            </span>
          </SectionTitle>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setAudioFile(file);
            }}
          />
          <div className="text-2xl text-gray-600">
            {audioFile ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-blue-600" />
                <span>已录制语音备注，将随本次用药一起保存。</span>
              </span>
            ) : (
              ""
            )}
          </div>
          <VoiceRecorderButton
            onRecorded={onRecordedNote}
            onRecordTooShort={() =>
              setModal({
                open: true,
                title: "录音太短",
                description: "请至少录制1秒。",
              })
            }
            labelIdle="开始录制"
            labelRecording="停止录制"
            labelProcessing="处理中..."
            onFallbackClick={onPickAudioNote}
          />
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <SectionTitle size="xl">
            <span className="inline-flex items-center gap-2">
              <Camera className="w-7 h-7 text-blue-600" />
              <span>拍摄药盒</span>
            </span>
          </SectionTitle>
          <input
            ref={boxImageInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setBoxImageFile(file);
            }}
          />
          <div className="text-2xl text-gray-600">
            {boxImageFile ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-blue-600" />
                <span>已拍摄药盒，可在用药排班中查看。</span>
              </span>
            ) : (
              ""
            )}
          </div>
          <PrimaryButton
            variant="photo"
            onClick={() => boxImageInputRef.current?.click()}
          >
            <span className="flex items-center justify-center gap-3">
              <Camera className="w-7 h-7 text-white" />
              <span>拍摄药盒照片</span>
            </span>
          </PrimaryButton>
          {boxImageFile && (
            <button
              type="button"
              className="text-base text-red-600 font-semibold"
              onClick={() => setBoxImageFile(null)}
            >
              清除已选照片
            </button>
          )}
        </div>
      </Card>

      <div className="pt-2" />
      <PrimaryButton onClick={onAdd} disabled={isAdding}>
        {isAdding ? "正在加入用药卡片" : "➕ 确认无误，保存用药"}
      </PrimaryButton>
      {addMsg ? (
        <div className="text-center text-2xl text-emerald-600 font-semibold">
          {addMsg}
        </div>
      ) : null}

      <PrimaryButton variant="secondary" onClick={onBack}>
        <span className="inline-flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          <span>返回重新输入</span>
        </span>
      </PrimaryButton>
    </div>
  );
}

// 解析服药时间字符串，提取时间段列表（用于时间轴分组）
function parseTimeSlots(raw) {
  if (!raw || typeof raw !== "string") return [];
  const sepCustom = "；注意：";
  const sepOld = "；";
  let standardTime = raw;
  if (raw.includes(sepCustom)) {
    standardTime = raw.slice(0, raw.indexOf(sepCustom)).trim();
  } else if (raw.includes(sepOld)) {
    standardTime = raw.slice(0, raw.indexOf(sepOld)).trim();
  }
  return standardTime
    .split(/[、；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 时间段排序顺序（与 ai_agents 标准医学时间库一致）
const TIME_SLOT_ORDER = [
  "紧急", "按需",
  "晨起空腹", "早餐前", "早餐中", "早餐后",
  "午餐前", "午餐中", "午餐后",
  "晚餐前", "晚餐中", "晚餐后",
  "睡前",
];
function getTimeSlotSortKey(slot) {
  const s = String(slot || "");
  for (let i = 0; i < TIME_SLOT_ORDER.length; i++) {
    if (s.includes(TIME_SLOT_ORDER[i])) return i;
  }
  return TIME_SLOT_ORDER.length;
}

function isTakenAtSlot(row, timeSlot) {
  const v = row?.["已服药"];
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object") return !!v[timeSlot];
  return false;
}

// ========== Reminder Tab ==========
function ElderReminderTab({ currentElderly }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [deletingIndex, setDeletingIndex] = useState(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);
  const [playingVoiceIndex, setPlayingVoiceIndex] = useState(null); // 正在播放语音的卡片 _index
  const [takenLoadingIndex, setTakenLoadingIndex] = useState(null);
  const [boxImageModal, setBoxImageModal] = useState({ open: false, imageUrl: null, drugName: "", loading: false });
  const [icsLoading, setIcsLoading] = useState(false);
  const cardAudioRef = useRef(null);

  const elderSchedules = schedules.filter(
    (row) =>
      String(row["姓名"] || "").trim() === currentElderly
  );

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const list = await fetchSchedules();
      setSchedules(list);
    } catch {
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: "获取用药排班失败，请稍后重试。",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [currentElderly]);

  const onDelete = async (index) => {
    if (deletingIndex != null) return;
    const row = schedules.find((r) => r._index === index);
    const medicineName = row?.["药品名称"] || "未知药品";
    const dosage = row?.["用法用量"] || "";
    setDeletingIndex(index);
    try {
      const data = await fetchDeleteMedicine(index);
      const list = data?.schedules || [];
      setSchedules(list);

      // 发送删除用药事件给家属端
      try {
        await fetchAddEvent({
          residentName: currentElderly,
          eventType: "delete_medicine",
          title: `删除了「${medicineName}」`,
          description: dosage ? `原用法用量：${dosage}` : "",
          isUrgent: false,
          chatContent: "",
        });
      } catch (err) {
        console.error("发送删除事件失败（不影响用户操作）:", err);
      }
    } catch {
      setModal({
        open: true,
        title: "删除失败",
        description: "暂时无法删除该用药记录，请稍后重试。",
      });
    } finally {
      setDeletingIndex(null);
    }
  };

  const onConfirmDelete = (index) => {
    setDeleteConfirmIndex(index);
  };

  const onCancelDelete = () => {
    setDeleteConfirmIndex(null);
  };

  const onProceedDelete = async () => {
    const index = deleteConfirmIndex;
    setDeleteConfirmIndex(null);
    if (index == null) return;
    await onDelete(index);
  };

  const onPlayVoice = async (row) => {
    const drugName = row["药品名称"] || "";
    if (!drugName) return;
    setPlayingVoiceIndex(row._index);
    try {
      const url = await fetchElderAudio(drugName);
      if (cardAudioRef.current) {
        cardAudioRef.current.src = url;
        cardAudioRef.current.onended = () => setPlayingVoiceIndex(null);
        await cardAudioRef.current.play();
      }
    } catch {
      setModal({
        open: true,
        title: "暂无语音叮嘱",
        description: `「${drugName}」暂无录制语音叮嘱，您可在添加药品时录制。`,
      });
      setPlayingVoiceIndex(null);
    }
  };

  const onViewBoxImage = async (row) => {
    const drugName = row["药品名称"] || "未命名药品";
    const dosage = row["用法用量"] || "未填写";
    const hasBoxImage = !!String(row["药盒图片"] || "").trim();
    setBoxImageModal({
      open: true,
      imageUrl: null,
      drugName,
      dosage,
      loading: hasBoxImage,
      rowForVoice: row,
    });
    if (!hasBoxImage) return;
    try {
      const url = await fetchBoxImage(row._index);
      setBoxImageModal((m) => ({ ...m, imageUrl: url, loading: false }));
    } catch {
      setBoxImageModal((m) => ({ ...m, loading: false }));
    }
  };

  const closeBoxImageModal = () => {
    const prev = boxImageModal.imageUrl;
    setBoxImageModal({
      open: false,
      imageUrl: null,
      drugName: "",
      dosage: "",
      loading: false,
      rowForVoice: null,
    });
    if (prev) URL.revokeObjectURL(prev);
  };

  const onPlayVoiceFromModal = () => {
    const row = boxImageModal.rowForVoice;
    if (row) onPlayVoice(row);
  };

  const onToggleTaken = async (row, slot) => {
    const idx = row._index;
    if (idx == null || takenLoadingIndex != null) return;
    const nextTaken = !isTakenAtSlot(row, slot);
    setTakenLoadingIndex(`${idx}-${slot}`);
    try {
      const data = await fetchElderToggleTakenSlot(idx, slot, nextTaken);
      setSchedules(data?.schedules || []);
    } catch {
      setModal({
        open: true,
        title: "更新失败",
        description: "暂时无法更新已服药状态，请稍后重试。",
      });
    } finally {
      setTakenLoadingIndex(null);
    }
  };

  // 构建时间轴数据：按时间段分组
  const timelineMap = new Map();
  elderSchedules.forEach((row) => {
    const slots = parseTimeSlots(row["服药时间"]);
    if (slots.length === 0) slots.push("未设置时间");
    slots.forEach((slot) => {
      if (!timelineMap.has(slot)) timelineMap.set(slot, []);
      timelineMap.get(slot).push(row);
    });
  });
  const timelineSlots = Array.from(timelineMap.keys()).sort(
    (a, b) => getTimeSlotSortKey(a) - getTimeSlotSortKey(b)
  );

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />

      {/* 药盒/药品详情弹窗 */}
      {boxImageModal.open && (
        <Modal
          open={true}
          title={boxImageModal.drugName}
          description={
            <div className="space-y-4">
              {boxImageModal.loading ? (
                <div className="flex items-center justify-center gap-3 py-8">
                  <LoadingDots />
                  <span>加载药盒照片中...</span>
                </div>
              ) : boxImageModal.imageUrl ? (
                <div className="flex justify-center">
                  <img
                    src={boxImageModal.imageUrl}
                    alt="药盒"
                    className="max-w-full max-h-[50vh] object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-100 shadow-md py-6 text-center text-gray-500 text-xl">
                  暂无药盒照片
                </div>
              )}
              <div className="rounded-xl bg-blue-50 shadow-md p-4">
                <div className="text-lg font-semibold text-gray-800 mb-1">用法用量</div>
                <div className="text-xl text-gray-700">{boxImageModal.dosage}</div>
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  className={classNames(
                    "inline-flex px-5 py-2.5 rounded-xl font-semibold text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95",
                    playingVoiceIndex === boxImageModal.rowForVoice?._index
                      ? "bg-blue-200 text-blue-800"
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  )}
                  disabled={playingVoiceIndex === boxImageModal.rowForVoice?._index}
                  onClick={onPlayVoiceFromModal}
                >
                  {playingVoiceIndex === boxImageModal.rowForVoice?._index
                    ? "播放中..."
                    : "收听语音叮嘱"}
                </button>
              </div>
            </div>
          }
          onClose={closeBoxImageModal}
        />
      )}

      <audio ref={cardAudioRef} className="hidden" />

      {/* 总体概览：时间轴 */}
      {elderSchedules.length > 0 && (
        <Card>
          <SectionTitle size="xl">
            <span className="inline-flex items-center gap-2">
              <AlarmClock className="w-7 h-7 text-blue-600" />
              <span>今日用药概览</span>
            </span>
          </SectionTitle>
          <div className="mt-4 relative">
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-blue-200 rounded-full" />
            {timelineSlots.map((slot) => (
              <div key={slot} className="relative pl-10 pb-6 last:pb-0">
                <div className="absolute left-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                  •
                </div>
                <div className="text-xl font-bold text-[#1e5a8e] mb-2">{slot}</div>
                <div className="space-y-2">
                  {timelineMap.get(slot).map((row, i) => {
                    const taken = isTakenAtSlot(row, slot);
                    const loadingKey = `${row._index}-${slot}`;
                    return (
                      <div
                        key={`${row._index}-${slot}-${i}`}
                        onClick={() => onViewBoxImage(row)}
                        className={classNames(
                          "flex items-center justify-between gap-3 py-2 px-3 rounded-xl border cursor-pointer hover:bg-blue-50/50 transition-colors",
                          taken ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xl text-gray-800 truncate">
                            {row["药品名称"] || "未命名药品"}
                          </div>
                          <div className="text-sm text-gray-600 truncate">
                            {row["用法用量"] || ""}
                          </div>
                        </div>
                        <label
                          className="flex items-center gap-2 shrink-0 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={taken}
                            disabled={takenLoadingIndex === loadingKey}
                            onChange={() => onToggleTaken(row, slot)}
                            className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-lg font-medium text-gray-700">
                            {takenLoadingIndex === loadingKey ? "更新中..." : "已服用"}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmIndex != null && (
        <Modal
          open={true}
          title="确认删除"
          description="您确定要删除这条用药记录吗？此操作无法撤销。"
          onClose={onCancelDelete}
          customActions={
            <div className="flex gap-3 mt-4">
              <button
                onClick={onCancelDelete}
                className="flex-1 px-4 py-3 rounded-2xl font-semibold text-gray-700 bg-gray-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-gray-300 transition-all active:scale-95"
              >
                取消
              </button>
              <button
                onClick={onProceedDelete}
                className="flex-1 px-4 py-3 rounded-2xl font-semibold text-white bg-red-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-red-700 transition-all active:scale-95"
              >
                确认删除
              </button>
            </div>
          }
        />
      )}
      <Card>
        <SectionTitle size="xl">当前老人用药排班</SectionTitle>
        <div className="mt-3 space-y-3">
          {elderSchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-2xl text-gray-500">
              暂无用药排班记录。
            </div>
          ) : (
            elderSchedules.map((row, idx) => (
              <div
                key={row._index ?? idx}
                className="rounded-2xl border border-gray-200 bg-white p-4"
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#1e5a8e]">药品：{row["药品名称"] || "未命名药品"}</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      className={classNames(
                        "inline-flex px-4 py-2 rounded-xl font-semibold text-base shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95",
                        playingVoiceIndex === row._index
                          ? "bg-blue-200 text-blue-800"
                          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      )}
                      disabled={playingVoiceIndex === row._index}
                      onClick={() => onPlayVoice(row)}
                    >
                      {playingVoiceIndex === row._index ? "播放中..." : "收听语音叮嘱"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex px-4 py-2 rounded-xl font-semibold text-base bg-amber-50 text-amber-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-amber-100 transition-all active:scale-95"
                      onClick={() => onViewBoxImage(row)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Camera className="w-5 h-5" />
                        <span>查看药盒</span>
                      </span>
                    </button>
                  </div>
                </div>
                {(() => {
                  const raw = row["服药时间"] || "";
                  const sepCustom = "；注意：";
                  const sepOld = "；";
                  let standardTime = raw;
                  let customTime = "";
                  if (raw.includes(sepCustom)) {
                    const i = raw.indexOf(sepCustom);
                    standardTime = raw.slice(0, i).trim();
                    customTime = raw.slice(i + sepCustom.length).trim();
                  } else if (raw.includes(sepOld)) {
                    const i = raw.indexOf(sepOld);
                    standardTime = raw.slice(0, i).trim();
                    customTime = raw.slice(i + sepOld.length).trim();
                  }
                  return (
                    <div className="mt-3 text-center">
                      <div className="text-2xl font-bold text-[#1e5a8e]">服药时间</div>
                      <div className="mt-1 text-2xl text-gray-600 text-left space-y-1">
                        <div>{standardTime || "未填写"}</div>
                        {customTime ? (
                          <div className="inline-flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-500 mt-1" />
                            <span>
                              <span className="text-gray-900">注意：</span>
                              {customTime}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3 text-center">
                  <div className="text-2xl font-bold text-[#1e5a8e]">用法用量</div>
                  <div className="mt-1 text-2xl text-gray-600 text-left">{row["用法用量"] || "未填写"}</div>
                </div>
                <div className="mt-3 text-center">
                  <div className="text-2xl font-bold text-[#1e5a8e]">用药禁忌</div>
                  <div className="mt-1 text-2xl text-gray-600 text-left">{row["识别禁忌"] || "无"}</div>
                </div>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    className="inline-flex items-center px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                    disabled={deletingIndex === row._index}
                    onClick={() => onConfirmDelete(row._index)}
                  >
                    {deletingIndex === row._index ? "正在删除..." : "删除这条用药"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <PrimaryButton
        variant="submit"
        onClick={loadSchedules}
        disabled={loading}
      >
        {loading ? "正在刷新我的用药排班..." : "刷新我的用药排班"}
      </PrimaryButton>

      <PrimaryButton
        variant="submit"
        disabled={icsLoading}
        onClick={async () => {
          setIcsLoading(true);
          try {
            const result = await addRemindersToCalendar({ days: 7 });
            if (result?.ok) {
              setModal({
                open: true,
                title: "添加成功",
                description: result.message || "已成功将本周用药提醒加入您的手机日历！",
              });
            }
          } catch (e) {
            setModal({ open: true, title: "添加失败", description: (e?.message || "请稍后重试。") });
          } finally {
            setIcsLoading(false);
          }
        }}
      >
        {icsLoading ? "正在生成…" : "一键导入日历"}
      </PrimaryButton>
      <p className="text-center text-gray-500 text-sm mt-2">
        若未弹出「用日历打开」？{" "}
        <button
          type="button"
          className="text-blue-600 underline"
          onClick={async () => {
            setIcsLoading(true);
            try {
              await downloadIcsReminder({ days: 7 });
            } catch {
              setModal({ open: true, title: "下载失败", description: "请稍后重试。" });
            } finally {
              setIcsLoading(false);
            }
          }}
        >
          下载 .ics 后到「文件」里打开
        </button>
      </p>
    </div>
  );
}

// ========== Chat Tab ==========
function ElderChatTab({ currentElderly }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "您好，我是您的家庭医生，有什么用药问题可以随时问我。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [ttsLoading, setTtsLoading] = useState(false);
  const [activeTtsIndex, setActiveTtsIndex] = useState(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const [asrLoading, setAsrLoading] = useState(false);

  const onSend = async () => {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await fetchChat({ message: text, bedNo: "", residentName: currentElderly });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply || "（医生暂时没有回应。）" },
      ]);

      // 发送问大夫事件给家属端
      try {
        const chatContent = `用户问：${text}\n医生答：${reply || "（医生暂时没有回应。）"}`;
        await fetchAddEvent({
          residentName: currentElderly,
          eventType: "ask_doctor",
          title: "使用问大夫功能",
          description: text.substring(0, 50) + (text.length > 50 ? "..." : ""),  // 前50字
          isUrgent: false,  // 问大夫不是紧急的
          chatContent: chatContent,
        });
      } catch (err) {
        console.error("发送问大夫事件失败（不影响用户操作）:", err);
      }
    } catch {
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: "发送咨询失败，请稍后重试。",
      });
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  const runTranscribe = async (file) => {
    setAsrLoading(true);
    try {
      const data = await fetchTranscribe(file);
      const text = (data?.text || "").trim();
      if (text) {
        setInput((prev) => (prev ? `${prev}\n${text}` : text));
      } else {
        setModal({
          open: true,
          title: "未识别到内容",
          description: "请重试或说清楚一些，也可直接使用文字输入。",
        });
      }
    } catch (e) {
      setModal({
        open: true,
        title: "语音识别失败",
        description: e?.message || "无法识别语音，请稍后重试或改用文字输入。",
      });
    } finally {
      setAsrLoading(false);
    }
  };

  const onPickAudio = () => fileInputRef.current?.click();

  const onAudioSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runTranscribe(file);
  };

  const onRecorded = async (blob) => {
    const mime = blob?.type || "audio/webm";
    const ext =
      mime.includes("aac") ? "aac" :
        mime.includes("mp4") ? "m4a" :
          mime.includes("mpeg") ? "mp3" :
            mime.includes("wav") ? "wav" : "webm";
    const file = new File([blob], `record.${ext}`, { type: mime });
    await runTranscribe(file);
  };

  const onReadMessage = async (idx, text) => {
    const content = String(text || "").trim();
    if (!content) return;

    setActiveTtsIndex(idx);
    setTtsLoading(true);
    try {
      const url = await fetchTts(content);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(() => { });
      }
    } catch {
      setModal({
        open: true,
        title: "朗读失败",
        description: "暂时无法朗读医生回答，请稍后重试。",
      });
    } finally {
      setTtsLoading(false);
      setActiveTtsIndex(null);
    }
  };

  return (
    <div className="px-4 pb-10 space-y-4">
      <audio ref={audioRef} className="hidden" />

      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />


      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onAudioSelected}
      />

      <Card>

        <div className="mt-3 h-[400px] overflow-y-auto rounded-2xl bg-gray-50 shadow-md p-4 space-y-3">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            const isAssistant = m.role === "assistant";
            return (
              <div
                key={idx}
                className={classNames(
                  "max-w-[85%] rounded-2xl p-3 shadow-sm",
                  isUser
                    ? "ml-auto bg-blue-600 text-white"
                    : "bg-white text-gray-900"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-2xl font-semibold">
                    {isUser ? "你" : "医生"}
                  </div>
                  {isAssistant && (
                    <button
                      type="button"
                      className="text-base px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                      disabled={ttsLoading && activeTtsIndex === idx}
                      onClick={() => onReadMessage(idx, m.content)}
                    >
                      {ttsLoading && activeTtsIndex === idx ? "朗读中..." : "朗读"}
                    </button>
                  )}
                </div>
                <div className="text-2xl whitespace-pre-wrap">{m.content}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <TextArea
        label="输入咨询"
        placeholder="如：我胃疼能吃布洛芬吗？"
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <VoiceRecorderButton
        onRecorded={onRecorded}
        onRecordTooShort={() =>
          setModal({
            open: true,
            title: "录音太短",
            description: "请至少录制约 1 秒后再松开。",
          })
        }
        labelIdle={asrLoading ? "正在识别语音..." : "开始录音"}
        labelRecording="停止录音"
        labelProcessing="处理中..."
        onFallbackClick={onPickAudio}
      />
      <p className="text-center text-gray-500 text-sm">
        无法使用麦克风时，可点击上方输入框直接文字输入。
      </p>
      <PrimaryButton
        variant="submit"
        onClick={onSend}
        disabled={loading}
      >
        {loading ? "正在向医生咨询..." : "发送"}
      </PrimaryButton>
    </div>
  );
}

// ========== Main ElderApp Component ==========
export default function ElderApp({ onBack }) {
  const [mode, setMode] = useState(ELDER_MODES.home);
  const [ocrResult, setOcrResult] = useState(null);
  const [currentElderly, setCurrentElderly] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem("currentElderName");
    return saved || "";
  });
  const [hasLoggedIn, setHasLoggedIn] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("currentElderName");
    return !!saved;
  });
  const [loginName, setLoginName] = useState("");

  const handleOcrResult = (result) => {
    setOcrResult(result);
    setMode(ELDER_MODES.ocrResult);
  };

  const handleGoToReminder = () => {
    setOcrResult(null);
    setMode(ELDER_MODES.reminder);
  };

  if (!hasLoggedIn) {
    return (
      <div className="px-6 py-12 space-y-8">
        <div className="text-center space-y-3">
          <div className="text-3xl font-extrabold text-gray-900">老人登录</div>
          <div className="text-sm text-gray-600">
            请输入本老人常用称呼，后续将用此姓名生成id二维码。
          </div>
        </div>
        <Card>
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              老人姓名
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="例如：王大爷"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-base shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </label>
            <PrimaryButton
              variant="submit"
              onClick={() => {
                const name = (loginName || "").trim();
                if (!name) return;
                try {
                  window.localStorage.setItem("currentElderName", name);
                } catch {
                  // ignore
                }
                setCurrentElderly(name);
                setHasLoggedIn(true);
              }}
            >
              确认并进入用药助手
            </PrimaryButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {mode === ELDER_MODES.home ? (
        <div className="px-4 py-10 space-y-6">
          <div className="text-center text-4xl font-extrabold text-gray-900 mb-6">
            选择功能
          </div>

          <ElderQrCard />

          <div className="space-y-4">
            <PrimaryButton
              onClick={() => setMode(ELDER_MODES.ocrInput)}
              className="text-3xl h-35 flex items-center justify-center gap-4 px-6 rounded-3xl bg-[#2F74B8] text-white"
            >
              <Pill className="w-10 h-10 text-white" />
              <span className="text-center">说明书翻译器</span>
            </PrimaryButton>
            <PrimaryButton
              onClick={() => setMode(ELDER_MODES.reminder)}
              className="text-3xl h-35 flex items-center justify-center gap-4 px-6 rounded-3xl bg-[#2F74B8] text-white"
            >
              <AlarmClock className="w-10 h-10 text-white" />
              <span className="text-center">查看用药提醒</span>
            </PrimaryButton>
            <PrimaryButton
              onClick={() => setMode(ELDER_MODES.chat)}
              className="text-3xl h-35 flex items-center justify-center gap-4 px-6 rounded-3xl bg-[#2F74B8] text-white"
            >
              <Stethoscope className="w-10 h-10 text-white" />
              <span className="text-center">有问题问大夫</span>
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {mode === ELDER_MODES.ocrInput ? (
        <ElderOcrInputSection onResult={handleOcrResult} onBack={() => setMode(ELDER_MODES.home)} />
      ) : null}

      {mode === ELDER_MODES.ocrResult ? (
        <ElderOcrResultSection
          ocrResult={ocrResult}
          onAddMedicine={handleGoToReminder}
          onBack={() => setMode(ELDER_MODES.ocrInput)}
          currentElderly={currentElderly}
        />
      ) : null}

      {mode === ELDER_MODES.reminder ? (
        <div>
          <div className="px-4 py-4 border-b border-gray-200">
            <PrimaryButton
              variant="secondary"
              onClick={() => setMode(ELDER_MODES.home)}
              className="w-auto px-6 py-3 text-2xl font-semibold bg-blue-50 text-blue-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
            >
              <span className="inline-flex items-center gap-2">
                <ArrowLeft className="w-6 h-6" />
                <span>返回首页</span>
              </span>
            </PrimaryButton>
          </div>
          <ElderReminderTab currentElderly={currentElderly} />
        </div>
      ) : null}

      {mode === ELDER_MODES.chat ? (
        <div>
          <div className="px-4 py-4 border-b border-gray-200">
            <PrimaryButton
              variant="secondary"
              onClick={() => setMode(ELDER_MODES.home)}
              className="w-auto px-6 py-3 text-2xl font-semibold bg-blue-50 text-blue-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
            >
              <span className="inline-flex items-center gap-2">
                <ArrowLeft className="w-6 h-6" />
                <span>返回首页</span>
              </span>
            </PrimaryButton>
          </div>
          <ElderChatTab currentElderly={currentElderly} />
        </div>
      ) : null}
    </div>
  );
}

