import { useState, useEffect, useRef } from "react";
import {
  AlarmClock,
  AlertCircle,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardList,
  MessageCircle,
  Pin,
  RefreshCcw,
  Search,
  Trash2,
  Volume2,
  User,
  Users,
  Mic,
  Pill,
  Stethoscope,
  XCircle,
  SunMedium,
  MoonStar,
  Soup,
} from "lucide-react";
import { CapacitorBarcodeScanner } from "@capacitor/barcode-scanner";
import {
  Card,
  LoadingDots,
  Modal,
  PrimaryButton,
  SectionTitle,
  StatusPill,
  TabBar,
  TextArea,
  TopBar,
  VoiceRecorderButton,
  classNames,
} from "../ui";
import {
  fetchAddMedicine,
  fetchAudioByIndex,
  fetchChat,
  fetchCheckDrugInteractions,
  fetchNurseToggleTaken,
  fetchNurseToggleTakenSlot,
  fetchOcr,
  fetchSchedules,
  fetchTranscribe,
  fetchTts,
  fetchDeleteMedicine,
  fetchAddEvent,
  fetchGetEvents,
} from "../apiClient";
import { compressImageFile } from "../imageHelper";
import { takePhotoWithNativeCamera } from "../cameraHelper";
import { addRemindersToCalendar, downloadIcsReminder } from "../calendarHelper";

const FAMILY_TABS = [
  {
    id: "activity",
    label: "服药情况",
    icon: AlarmClock,
  },
  {
    id: "events",
    label: "老人事件",
    icon: ClipboardList,
  },
  {
    id: "intake",
    label: "信息录入",
    icon: Pill,
  },
  {
    id: "manage",
    label: "用药管理",
    icon: ClipboardList,
  },
  {
    id: "chat",
    label: "问大夫",
    icon: Stethoscope,
  },
];

function OcrSection({ onResult }) {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [statusText, setStatusText] = useState("等待输入...");
  const [previewUrl, setPreviewUrl] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [summary, setSummary] = useState("");
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [contra, setContra] = useState("");
  const [timeList, setTimeList] = useState([]);
  const [customTime, setCustomTime] = useState("");

  const [modal, setModal] = useState({ open: false, title: "", description: "" });

  const openPicker = async () => {
    const file = await takePhotoWithNativeCamera();
    if (file) {
      setSelectedFile(file);
      setStatusText(`已拍摄：${file.name}`);
      return;
    }
    fileInputRef.current?.click();
  };
  const onPickFile = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (file) {
      setStatusText(file.name ? `已选择：${file.name}` : "已选择 1 张图片");
    } else {
      setStatusText("等待输入...");
    }
  };

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const onSubmit = async () => {
    if (!selectedFile && !String(textInput || "").trim()) {
      setModal({
        open: true,
        title: "还差一步",
        description: "请先拍照/上传图片，或在上方输入说明书文字。",
      });
      return;
    }

    setIsLoading(true);
    setStatusText("正在拼命阅读说明书...");
    try {
      const compressed = selectedFile ? await compressImageFile(selectedFile) : null;
      const data = await fetchOcr({ imageFile: compressed, text: textInput });
      const nextSummary = data?.summary || "";
      const nextName = data?.name || "";
      const nextDosage = data?.dosage || "";
      const nextContra = data?.contra || "";
      const nextTimeList = Array.isArray(data?.time) ? data.time : [];
      const nextCustomTime = data?.custom_time || "";

      setStatusText(data?.status || "已完成解析");
      setSummary(nextSummary);
      setName(nextName);
      setDosage(nextDosage);
      setContra(nextContra);
      setTimeList(nextTimeList);
      setCustomTime(nextCustomTime);
      onResult?.({
        summary: nextSummary,
        name: nextName,
        dosage: nextDosage,
        contra: nextContra,
        timeList: nextTimeList,
        customTime: nextCustomTime,
      });
    } catch (err) {
      const isAbort =
        err?.name === "AbortError" || String(err?.message || "").includes("aborted");
      setStatusText(selectedFile ? "已选择 1 张图片" : "等待输入...");
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
    <div className="space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
      <SectionTitle>请输入药品说明书</SectionTitle>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />

      <PrimaryButton variant="photo" onClick={openPicker} disabled={isLoading}>
        <span className="flex items-center justify-center gap-3">
          <Camera className="w-6 h-6 text-white" />
          <span>点击拍照</span>
        </span>
      </PrimaryButton>

      {previewUrl ? (
        <div className="flex justify-center">
          <img
            src={previewUrl}
            alt="已选择的说明书图片"
            className="w-full max-h-64 object-contain rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-white/60 bg-white/70 backdrop-blur"
          />
        </div>
      ) : null}

      <TextArea
        placeholder="请在此处输入药品说明书..."
        rows={3}
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
      />

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

      <div className="pt-2">
        <div className="h-px bg-gray-200" />
      </div>

      <SectionTitle>智能解析（请绑定老人）</SectionTitle>

      <Card>
        <div className="space-y-3">
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="w-7 h-7 text-blue-600" />
              <span>智能概括</span>
            </span>
          </SectionTitle>
          <TextArea
            placeholder="（这里显示 AI 概括结果，可手动修改）"
            rows={3}
            value={summary}
            onChange={(e) => {
              const v = e.target.value;
              setSummary(v);
              onResult?.({
                summary: v,
                name,
                dosage,
                contra,
                timeList,
                customTime,
              });
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2">药品名称</div>
            <input
              className="w-full bg-stone-100 rounded-2xl shadow-md hover:shadow-lg transition-shadow p-4 text-2xl text-gray-900 outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="（自动填充，可手动修改）"
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                onResult?.({
                  summary,
                  name: v,
                  dosage,
                  contra,
                  timeList,
                  customTime,
                });
              }}
            />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2">用法用量</div>
            <TextArea
              placeholder="（自动填充，可手动修改）"
              rows={2}
              value={dosage}
              onChange={(e) => {
                const v = e.target.value;
                setDosage(v);
                onResult?.({
                  summary,
                  name,
                  dosage: v,
                  contra,
                  timeList,
                  customTime,
                });
              }}
            />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2">
              提取禁忌（触发风控）
            </div>
            <TextArea
              placeholder="（自动填充，可手动修改）"
              rows={2}
              value={contra}
              onChange={(e) => {
                const v = e.target.value;
                setContra(v);
                onResult?.({
                  summary,
                  name,
                  dosage,
                  contra: v,
                  timeList,
                  customTime,
                });
              }}
            />
          </div>
        </div>
      </Card>

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
                className="px-3 py-2 rounded-2xl text-lg font-semibold bg-gray-200 text-gray-800 shadow-md"
              >
                <span className="inline-flex items-center gap-2">
                  {x.includes("早餐") ? (
                    <SunMedium className="w-4 h-4 text-amber-500" />
                  ) : x.includes("午餐") ? (
                    <SunMedium className="w-4 h-4 text-yellow-500" />
                  ) : x.includes("晚餐") ? (
                    <Soup className="w-4 h-4 text-orange-500" />
                  ) : x.includes("睡前") ? (
                    <MoonStar className="w-4 h-4 text-indigo-500" />
                  ) : null}
                  <span>{x}</span>
                </span>
              </span>
            ))}
            {(!Array.isArray(timeList) || timeList.length === 0) && (
              <span className="text-gray-500 text-base">未推断</span>
            )}
          </div>
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2 inline-flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>特殊用药时间说明</span>
            </div>
            <TextArea
              placeholder="例如：每8小时一次；空腹服用；餐前1小时… 可手动修改"
              rows={2}
              value={customTime}
              onChange={(e) => {
                const v = e.target.value;
                setCustomTime(v);
                onResult?.({
                  summary,
                  name,
                  dosage,
                  contra,
                  timeList,
                  customTime: v,
                });
              }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== 老人端事件标签页 ==========
function ElderActivityTab() {
  const [schedules, setSchedules] = useState([]);
  const [elderlyList, setElderlyList] = useState([]);
  const [selectedElderly, setSelectedElderly] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [takenLoadingKey, setTakenLoadingKey] = useState(null);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const list = await fetchSchedules();
      setSchedules(list);

      // 从数据中提取所有老人的名字
      let elders = [...new Set(
        list
          .map((row) => row["姓名"])
          .filter((name) => name && String(name).trim())
      )];

      // 如果当前已绑定老人（通过扫码），即便暂时没有用药记录，也要出现在下拉列表中
      try {
        const bound = typeof window !== "undefined"
          ? String(window.localStorage.getItem("nurseBoundElderName") || "").trim()
          : "";
        if (bound && !elders.includes(bound)) {
          elders = [bound, ...elders];
        }
      } catch {
        // 忽略 localStorage 读取错误
      }

      if (elders.length > 0) {
        setElderlyList(elders);
        setSelectedElderly((prev) => (prev && elders.includes(prev) ? prev : elders[0]));
      }
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
  }, []);

  const selectedElderlySchedules = schedules.filter(
    (row) => String(row["姓名"] || "") === selectedElderly
  );

  // 解析服药时间，提取时间段列表
  const parseTimeSlots = (raw) => {
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
  };

  const TIME_SLOT_ORDER = [
    "紧急", "按需",
    "晨起空腹", "早餐前", "早餐中", "早餐后",
    "午餐前", "午餐中", "午餐后",
    "晚餐前", "晚餐中", "晚餐后",
    "睡前",
  ];

  const getTimeSlotSortKey = (slot) => {
    const s = String(slot || "");
    for (let i = 0; i < TIME_SLOT_ORDER.length; i++) {
      if (s.includes(TIME_SLOT_ORDER[i])) return i;
    }
    return TIME_SLOT_ORDER.length;
  };

  // 判断在特定时间段是否已服用
  const isTakenAtSlot = (row, timeSlot) => {
    const v = row?.["已服药"];
    if (typeof v === "boolean") return v;
    if (v && typeof v === "object") return !!v[timeSlot];
    return false;
  };

  // 更新已服用状态（只更新该条记录在此时段的状态，不影响其他时段）
  const onToggleTaken = async (row, slot) => {
    const idx = row._index;
    if (idx == null || takenLoadingKey != null) return;
    const nextTaken = !isTakenAtSlot(row, slot);
    setTakenLoadingKey(`${idx}-${slot}`);
    try {
      const data = await fetchNurseToggleTakenSlot(idx, slot, nextTaken);
      setSchedules(data?.schedules || []);
    } catch {
      setModal({
        open: true,
        title: "更新失败",
        description: "暂时无法更新已服药状态，请稍后重试。",
      });
    } finally {
      setTakenLoadingKey(null);
    }
  };

  // 构建时间轴数据
  const timelineMap = new Map();
  selectedElderlySchedules.forEach((row) => {
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

      {/* 老人选择 */}
      <Card>
        <SectionTitle size="xl">
          <span className="inline-flex items-center gap-2">
            <User className="w-7 h-7 text-blue-600" />
            <span>选择老人</span>
          </span>
        </SectionTitle>
        <div className="mt-3 space-y-2">
          {elderlyList.map((name) => (
            <button
              key={name}
              onClick={() => setSelectedElderly(name)}
              className={`w-full p-4 rounded-2xl text-left font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 ${selectedElderly === name
                ? "bg-blue-600 text-white"
                : "bg-gray-50 text-gray-800 hover:bg-gray-100"
                }`}
            >
              <span className="inline-flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                <span>{name}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 单列布局：服药情况 */}
      <div>
        {/* 用药时间轴与完成情况 */}
        {selectedElderlySchedules.length > 0 && (
          <Card>
            <SectionTitle size="lg">
              <span className="inline-flex items-center gap-2">
                <AlarmClock className="w-6 h-6 text-blue-600" />
                <span>服药情况</span>
              </span>
            </SectionTitle>
            <div className="mt-4 relative">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-blue-200 rounded-full" />
              {timelineSlots.map((slot) => (
                <div key={slot} className="relative pl-10 pb-6 last:pb-0">
                  <div className="absolute left-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                    •
                  </div>
                  <div className="text-lg font-bold text-[#1e5a8e] mb-2">{slot}</div>
                  <div className="space-y-2">
                    {timelineMap.get(slot).map((row, i) => {
                      const taken = isTakenAtSlot(row, slot);
                      const loadingKey = `${row._index}-${slot}`;
                      return (
                        <div
                          key={`${row._index}-${slot}-${i}`}
                          className={classNames(
                            "flex items-center justify-between gap-3 py-2 px-3 rounded-lg border transition-colors text-sm",
                            taken ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-800 truncate">
                              {row["药品名称"] || "未命名药品"}
                            </div>
                            <div className="text-xs text-gray-600 truncate">
                              {row["用法用量"] || ""}
                            </div>
                          </div>
                          <label className="flex items-center gap-1 shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={taken}
                              disabled={takenLoadingKey === loadingKey}
                              onChange={() => onToggleTaken(row, slot)}
                              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-medium text-gray-700">
                              {takenLoadingKey === loadingKey ? "更新中..." : "已服用"}
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

        {selectedElderlySchedules.length === 0 && (
          <Card>
            <div className="text-center text-gray-500 py-8">
              <div className="text-lg">暂无此用户的用药记录</div>
            </div>
          </Card>
        )}
      </div>

      <PrimaryButton variant="submit" onClick={() => { loadSchedules(); }} disabled={loading}>
        {loading ? "正在刷新..." : "刷新数据"}
      </PrimaryButton>
    </div>
  );
}

// ========== 老人事件标签页 ==========
function ElderEventsTab() {
  const [events, setEvents] = useState([]);
  const [elderlyList, setElderlyList] = useState([]);
  const [selectedElderly, setSelectedElderly] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [selectedEventForChat, setSelectedEventForChat] = useState(null);

  const loadSchedules = async () => {
    loading === false && setLoading(true);
    try {
      const list = await fetchSchedules();
      // 从数据中提取所有老人的名字
      const elders = [...new Set(list
        .map((row) => row["姓名"])
        .filter((name) => name && name.trim())
      )];
      if (elders.length > 0) {
        setElderlyList(elders);
        if (!elders.includes(selectedElderly)) {
          setSelectedElderly(elders[0]);
        }
      }
    } catch {
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: "获取老人列表失败，请稍后重试。",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async (residentName) => {
    setLoading(true);
    try {
      const data = await fetchGetEvents(residentName);
      setEvents(data?.events || []);
    } catch {
      console.error("加载事件失败");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  useEffect(() => {
    loadEvents(selectedElderly);
  }, [selectedElderly]);

  // 获取事件显示文本和颜色
  const getEventDisplay = (event) => {
    const typeMap = {
      "add_medicine": "➕ 添加药品",
      "drug_conflict": "冲突警告",
      "ask_doctor": "问大夫",
      "delete_medicine": "删除用药",
    };
    return {
      label: typeMap[event.event_type] || event.event_type,
      color: event.is_urgent ? "red" : "blue",
    };
  };

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />

      {/* 聊天记录查看弹窗 */}
      {selectedEventForChat && selectedEventForChat.event_type === "ask_doctor" && (
        <Modal
          open={true}
          title="问大夫 - 聊天记录"
          description={
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {selectedEventForChat.chat_content ? (
                <div className="bg-gray-50 rounded-lg shadow-md p-4 whitespace-pre-wrap text-sm text-gray-700">
                  {selectedEventForChat.chat_content}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">暂无聊天内容</div>
              )}
              <div className="text-xs text-gray-500 text-right">
                {new Date(selectedEventForChat.timestamp * 1000).toLocaleString()}
              </div>
            </div>
          }
          onClose={() => setSelectedEventForChat(null)}
        />
      )}

      {/* 老人选择 */}
      <Card>
        <SectionTitle size="xl">
          <span className="inline-flex items-center gap-2">
            <User className="w-7 h-7 text-blue-600" />
            <span>选择老人</span>
          </span>
        </SectionTitle>
        <div className="mt-3 space-y-2">
          {elderlyList.map((name) => (
            <button
              key={name}
              onClick={() => setSelectedElderly(name)}
              className={`w-full p-4 rounded-2xl text-left font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 ${selectedElderly === name
                ? "bg-blue-600 text-white"
                : "bg-gray-50 text-gray-800 hover:bg-gray-100"
                }`}
            >
              <span className="inline-flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                <span>{name}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* 老人事件列表 */}
      <Card>
        <SectionTitle size="lg">
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            <span>老人事件</span>
          </span>
        </SectionTitle>
        {loading ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <LoadingDots />
          </div>
        ) : events.length === 0 ? (
          <div className="mt-4 text-center text-gray-500 py-8">
            <div className="text-base">无事件</div>
          </div>
        ) : (
          <div className="mt-4 space-y-2 max-h-[500px] overflow-y-auto">
            {events.map((event, idx) => {
              const display = getEventDisplay(event);
              const bgColor = display.color === "red"
                ? "bg-red-50 border-red-200"
                : "bg-blue-50 border-blue-200";
              const textColor = display.color === "red"
                ? "text-red-700"
                : "text-blue-700";
              const isClickable = event.event_type === "ask_doctor";

              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (isClickable) {
                      setSelectedEventForChat(event);
                    }
                  }}
                  className={classNames(
                    "w-full text-left p-3 rounded-lg border shadow-md transition-all",
                    bgColor,
                    isClickable && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 hover:opacity-90 active:scale-95"
                  )}
                >
                  <div className={classNames("font-semibold text-sm", textColor)}>
                    {display.label}
                  </div>
                  <div className={classNames("text-xs mt-1", textColor)}>
                    {event.title}
                  </div>
                  {event.description && (
                    <div className={classNames("text-xs mt-1 opacity-75", textColor)}>
                      {event.description}
                    </div>
                  )}
                  <div className={classNames("text-xs mt-2 opacity-60", textColor)}>
                    {new Date(event.timestamp * 1000).toLocaleTimeString()}
                  </div>
                  {isClickable && (
                    <div className={classNames("text-xs mt-1", textColor)}>
                      <span className="inline-flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-blue-600" />
                        <span>点击查看聊天记录</span>
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <PrimaryButton variant="submit" onClick={() => { loadEvents(selectedElderly); }} disabled={loading}>
        {loading ? "正在刷新..." : "刷新数据"}
      </PrimaryButton>
    </div>
  );
}

function FamilyIntakeTab() {
  const [ocrResult, setOcrResult] = useState(null);
  const [residentName, setResidentName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [audioFile, setAudioFile] = useState(null);
  const audioInputRef = useRef(null);

  // 用于显示药物相互作用警告的弹窗
  const [interactionWarning, setInteractionWarning] = useState({
    open: false,
    interactions: [],
    aiWarning: "",
    hasConfirmed: false,
  });
  const [icsLoading, setIcsLoading] = useState(false);

  const doAdd = async () => {
    setIsAdding(true);
    setAddMsg("");
    try {
      const data = await fetchAddMedicine({
        bedNo: "",
        residentName: residentName.trim(),
        name: ocrResult.name,
        dosage: ocrResult.dosage,
        contra: ocrResult.contra,
        timeList: ocrResult.timeList,
        customTime: ocrResult.customTime,
        audioFile,
      });
      setAddMsg(data?.message || "已加入用药排班。");
      // 重置相互作用确认标志
      setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
    } catch {
      setModal({
        open: true,
        title: "网络似乎开了个小差",
        description: "加入机构排班失败，请稍后重试。",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const onAdd = async () => {
    if (!residentName.trim()) {
      setModal({
        open: true,
        title: "请先填写老人信息",
        description: "老人姓名为必填项。",
      });
      return;
    }
    if (!ocrResult || !ocrResult.name) {
      setModal({
        open: true,
        title: "还没有药品信息",
        description: "请先完成一次 AI 检测，自动识别药品名称后再加入机构排班。",
      });
      return;
    }

    // 如果已经在弹窗中确认过风险，直接执行保存逻辑，避免重复检查
    if (interactionWarning.hasConfirmed) {
      await doAdd();
      return;
    }

    // 如果还未确认相互作用警告，先检查
    setIsAdding(true);
    try {
      const result = await fetchCheckDrugInteractions({
        name: ocrResult.name,
        dosage: ocrResult.dosage,
        contra: ocrResult.contra,
        bedNo: "",
        residentName: residentName.trim(),
      });

      if (result?.has_interactions) {
        // 有相互作用，显示警告弹窗，等待用户在弹窗中确认
        setInteractionWarning({
          open: true,
          interactions: result.interactions || [],
          aiWarning: result.ai_warning || "",
          hasConfirmed: false,
        });
        return;
      }
      // 没有相互作用，直接执行添加
      setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
      await doAdd();
    } catch (err) {
      console.error("检查相互作用失败:", err);
      // 检查失败也直接继续执行添加，避免卡住
      await doAdd();
    } finally {
      setIsAdding(false);
    }
  };

  const onConfirmInteraction = () => {
    // 用户确认了相互作用警告，标记为已确认并继续
    setInteractionWarning((w) => ({ ...w, hasConfirmed: true }));
    // 立即调用onAdd再次执行，这次会跳过相互作用检查
    setTimeout(() => {
      onAdd();
    }, 0);
  };

  const onCancelInteraction = () => {
    // 用户取消了，关闭弹窗，不执行添加
    setInteractionWarning({ open: false, interactions: [], aiWarning: "", hasConfirmed: false });
  };

  const onPickAudioNote = () => audioInputRef.current?.click();

  const onRecordedNote = async (blob) => {
    // 家属语音备注直接随排班一起保存，不做语音识别
    const file = new File([blob], "family-note.webm", { type: blob.type || "audio/webm" });
    setAudioFile(file);
  };

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />

      {/* 药物相互作用警告弹窗 */}
      {interactionWarning.open && (
        <Modal
          open={true}
          title={
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
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
                      <li key={idx} className="text-sm text-red-700">
                        <div className="font-semibold">
                          {interaction.existing_drug}
                          <span
                            className={`ml-2 px-2 py-1 rounded text-xs font-bold ${interaction.risk_level === "严重"
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
                    <Bot className="w-5 h-5 text-orange-600" />
                    <span>AI 专业分析与建议</span>
                  </div>
                  <div className="text-sm text-orange-700 whitespace-pre-wrap">
                    {interactionWarning.aiWarning}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <div className="text-sm text-blue-700">
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
                  <XCircle className="w-5 h-5" />
                  <span>取消添加，重新检查</span>
                </span>
              </button>
              <button
                onClick={onConfirmInteraction}
                className="flex-1 px-4 py-3 rounded-2xl font-semibold text-white bg-red-600 shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:bg-red-700 transition-all active:scale-95"
              >
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>我已确认风险，继续添加</span>
                </span>
              </button>
            </div>
          }
        />
      )}

      <OcrSection onResult={setOcrResult} />

      <Card>
        <div className="space-y-4">
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2 inline-flex items-center gap-2">
              <User className="w-5 h-5" />
              <span>老人姓名（必填）</span>
            </div>
            <input
              className="w-full bg-stone-100 rounded-xl shadow-md hover:shadow-lg transition-shadow px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="例如：王大爷"
              value={residentName}
              onChange={(e) => setResidentName(e.target.value)}
            />
          </div>
          <Card>
            <div className="space-y-3">
              <SectionTitle>
                <span className="inline-flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  <span>语音备注</span>
                </span>
              </SectionTitle>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setAudioFile(file);
                }}
              />
              <div className="text-sm text-gray-600">
                {audioFile ? (
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                    <span>已录制/选择家属语音备注，将随排班一起保存。</span>
                  </span>
                ) : (
                  "可录制一段简短语音给后续值班家属作为补充说明。"
                )}
              </div>
              <VoiceRecorderButton
                onRecorded={onRecordedNote}
                onRecordTooShort={() =>
                  setModal({
                    open: true,
                    title: "录音太短",
                    description: "请至少录制约 1 秒后再松开。",
                  })
                }
                labelIdle="开始录制"
                labelRecording="停止录音"
                labelProcessing="处理中..."
                onFallbackClick={onPickAudioNote}
              />
            </div>
          </Card>
        </div>
      </Card>

      <PrimaryButton onClick={onAdd} disabled={isAdding}>
        {isAdding ? (
          "正在加入用药排班..."
        ) : (
          "确认无误，加入用药排班"
        )}
      </PrimaryButton>
      {addMsg ? (
        <div className="text-center text-base text-emerald-600 font-semibold">
          {addMsg}
        </div>
      ) : null}
      <PrimaryButton
        disabled={icsLoading}
        onClick={async () => {
          setIcsLoading(true);
          try {
            const result = await addRemindersToCalendar({
              bedNo: "",
              residentName: residentName.trim(),
              days: 7,
            });
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
              await downloadIcsReminder({
                bedNo: "",
                residentName: residentName.trim(),
                days: 7,
              });
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

function FamilyManageTab() {
  const [schedules, setSchedules] = useState([]);
  const [filterName, setFilterName] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [takenLoading, setTakenLoading] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchSchedules();
      setSchedules(list);
      setFilterName("");
      setSelectedIndex(null);
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
    load();
  }, []);

  const filtered = schedules
    // 保留所有有姓名的记录（包括老人端和家属端添加的数据）
    .filter((row) => {
      const name = String(row["姓名"] || "").trim();
      // 只保留有姓名的记录
      return name;
    })
    .filter((row) => {
      const name = String(row["姓名"] || "");
      // 如果filterName为空，显示所有；否则只显示匹配的
      return !filterName || name.includes(filterName.trim());
    });

  const selectedRow =
    selectedIndex != null && filtered[selectedIndex] ? filtered[selectedIndex] : null;

  const onDeleteSelected = async () => {
    if (!selectedRow) return;
    if (selectedRow._index === undefined && selectedRow._index !== 0) return;
    if (deletingIndex != null) return;
    setDeletingIndex(selectedRow._index);
    try {
      const data = await fetchDeleteMedicine(selectedRow._index);
      const nextSchedules = Array.isArray(data?.schedules)
        ? data.schedules
        : schedules.filter((row) => row._index !== selectedRow._index);
      setSchedules(nextSchedules);
      setSelectedIndex(null);
      setAudioUrl(null);
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

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
      <Card>
        <SectionTitle size="xl">搜索</SectionTitle>
        <div className="mt-3">
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2">
              <span className="inline-flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-600" />
                <span>按姓名搜索</span>
              </span>
            </div>
            <input
              className="w-full bg-stone-100 rounded-xl shadow-md hover:shadow-lg transition-shadow px-4 py-4 text-base outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="例如：王大爷"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle size="xl">匹配到的用药记录</SectionTitle>
        <div className="mt-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 shadow-md p-4 text-base text-gray-500">
              暂无匹配记录。
            </div>
          ) : (
            filtered.map((row, idx) => {
              const label = `${row["姓名"] || "默认老人"} - ${row["药品名称"] || ""
                }`;
              const checked = selectedIndex === idx;
              return (
                <label
                  key={idx}
                  className="flex items-center gap-3 bg-gray-50 rounded-2xl shadow-md hover:shadow-lg transition-all p-4 active:scale-[0.99]"
                >
                  <input
                    type="radio"
                    className="h-5 w-5"
                    checked={checked}
                    onChange={() => setSelectedIndex(idx)}
                  />
                  <div className="text-base font-semibold text-gray-900">{label}</div>
                </label>
              );
            })
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle size="xl">用药详情卡片</SectionTitle>
        <div className="mt-3 rounded-2xl bg-gray-50 shadow-md p-4 text-base text-gray-700">
          {selectedRow ? (
            <>
              <div className="text-center text-gray-700">
                <div className="text-base font-bold text-[#1e5a8e]">老人姓名</div>
                <div className="mt-1 text-base">{selectedRow["姓名"] || "默认老人"}</div>
              </div>
              <div className="mt-3 text-center">
                <div className="text-lg font-bold text-[#1e5a8e]">药品：{selectedRow["药品名称"] || "未知"}</div>
              </div>
              {(() => {
                const raw = selectedRow["服药时间"] || "";
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
                    <div className="text-base font-bold text-[#1e5a8e]">服药时间</div>
                    <div className="mt-1 text-base text-gray-700 text-left space-y-1">
                      <div>{standardTime || "未填写"}</div>
                      {customTime ? (
                        <div className="inline-flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />
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
                <div className="text-base font-bold text-[#1e5a8e]">用法用量</div>
                <div className="mt-1 text-base text-gray-700 text-left">{selectedRow["用法用量"] || "未填写"}</div>
              </div>
              <div className="mt-3 text-center">
                <div className="text-base font-bold text-[#1e5a8e]">用药禁忌</div>
                <div className="mt-1 text-base text-gray-700 text-left">{selectedRow["识别禁忌"] || "无"}</div>
              </div>
              <div className="mt-3 text-right">
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-1 rounded-full bg-red-50 text-red-600 text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
                  disabled={deletingIndex === selectedRow._index}
                  onClick={onDeleteSelected}
                >
                  {deletingIndex === selectedRow._index ? "正在删除..." : "删除这条用药"}
                </button>
              </div>
            </>
          ) : (
            "当前没有选中的用药记录。"
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle size="xl">语音叮嘱播放</SectionTitle>
        <div className="mt-3 rounded-2xl bg-gray-50 shadow-md p-4 text-base text-gray-600">
          {selectedRow && selectedRow["语音文件"] ? (
            <>
              <PrimaryButton
                variant="ghost"
                onClick={async () => {
                  if (
                    selectedRow._index === undefined &&
                    selectedRow._index !== 0
                  )
                    return;
                  setAudioLoading(true);
                  try {
                    const url = await fetchAudioByIndex(selectedRow._index);
                    setAudioUrl(url);
                  } catch {
                    setModal({
                      open: true,
                      title: "获取语音失败",
                      description: "暂时无法播放该药品的语音叮嘱。",
                    });
                  } finally {
                    setAudioLoading(false);
                  }
                }}
                disabled={audioLoading}
              >
                {audioLoading ? "正在加载语音..." : "播放语音叮嘱"}
              </PrimaryButton>
              {audioUrl ? (
                <audio src={audioUrl} controls className="w-full mt-3" />
              ) : null}
            </>
          ) : (
            "当前记录没有语音叮嘱。"
          )}
        </div>
      </Card>

      <Card>
        <label className="flex items-center gap-3 bg-gray-50 rounded-2xl shadow-md hover:shadow-lg transition-shadow p-4">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={
              (() => {
                const v = selectedRow?.["已服药"];
                if (typeof v === "boolean") return v;
                if (v && typeof v === "object" && !Array.isArray(v))
                  return Object.values(v).some(Boolean);
                return !!v;
              })()
            }
            onChange={async (e) => {
              if (
                !selectedRow ||
                (selectedRow._index === undefined && selectedRow._index !== 0)
              )
                return;
              const nextTaken = e.target.checked;
              setTakenLoading(true);
              try {
                const data = await fetchNurseToggleTaken(
                  selectedRow._index,
                  nextTaken
                );
                const nextSchedules = Array.isArray(data?.schedules)
                  ? data.schedules
                  : schedules;
                setSchedules(nextSchedules);
              } catch {
                setModal({
                  open: true,
                  title: "更新失败",
                  description: "更新已服药状态失败，请稍后重试。",
                });
              } finally {
                setTakenLoading(false);
              }
            }}
          />
          <div className="text-base font-semibold text-gray-900">
            {takenLoading ? "正在更新已服药状态..." : "勾选表示本次已服药"}
          </div>
        </label>
      </Card>

      <PrimaryButton variant="submit" onClick={load} disabled={loading}>
        {loading ? "正在刷新..." : "刷新并清空搜索"}
      </PrimaryButton>
    </div>
  );
}

function FamilyChatTab() {
  const [residentName, setResidentName] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "" });
  const fileInputRef = useRef(null);
  const [asrLoading, setAsrLoading] = useState(false);

  const onSend = async () => {
    const text = input.trim();
    if (!text) return;
    const next = [
      ...messages,
      { role: "user", content: text, meta: { bedNo: "", residentName } },
    ];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await fetchChat({ message: text, bedNo: "", residentName });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply || "（医生暂时没有回应。）" },
      ]);
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

  const onPickAudio = () => fileInputRef.current?.click();

  const runTranscribe = async (file) => {
    setAsrLoading(true);
    try {
      const data = await fetchTranscribe(file);
      const text = data?.text || "";
      if (text) {
        setInput((prev) => (prev ? `${prev}\n${text}` : text));
      }
    } catch {
      setModal({
        open: true,
        title: "语音识别失败",
        description: "无法识别语音，请稍后重试或改用文字输入。",
      });
    } finally {
      setAsrLoading(false);
    }
  };

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

  return (
    <div className="px-4 pb-10 space-y-4">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
      <Card>
        <SectionTitle size="xl">
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-blue-600" />
            <span>用药信息查询</span>
          </span>
        </SectionTitle>
        <div className="mt-2 text-sm text-gray-600">
          请输入老人信息，系统将自动查询其用药记录并帮助医生制定个性化建议。
        </div>
        <div className="mt-4">
          <div>
            <div className="text-base font-semibold text-gray-800 mb-2">
              <span className="inline-flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                <span>老人姓名（可选）</span>
              </span>
            </div>
            <input
              className="w-full bg-stone-100 rounded-xl shadow-md hover:shadow-lg transition-shadow px-4 py-4 text-lg outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="例如：王大爷"
              value={residentName}
              onChange={(e) => setResidentName(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle size="xl">对话</SectionTitle>
        <div className="mt-3 h-[320px] overflow-y-auto rounded-2xl bg-gray-50 shadow-md p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-lg text-gray-500">
              请输入患者信息和问题，系统会结合用药记录为你提供建议。
            </div>
          ) : null}
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
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
                <div className="text-sm font-semibold">
                  {isUser ? "家属" : "医生"}
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onAudioSelected}
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
        labelIdle={asrLoading ? "正在识别语音..." : "开始录音提问"}
        labelRecording="停止录音"
        labelProcessing="处理中..."
        onFallbackClick={onPickAudio}
      />
      <TextArea
        label="输入咨询"
        placeholder="如：患者晚上可以吃这种药吗？"
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <PrimaryButton variant="submit" onClick={onSend} disabled={loading}>
        {loading ? "正在向医生咨询..." : "发送"}
      </PrimaryButton>
    </div>
  );
}

export default function NurseApp({ onBack }) {
  const [tab, setTab] = useState("activity");
  const [scanOpen, setScanOpen] = useState(false);
  const [modal, setModal] = useState({ open: false, title: "", description: "", reloadOnClose: false });
  const [pendingBind, setPendingBind] = useState(null);
  const [scanning, setScanning] = useState(false);

  const handleConfirmBind = () => {
    if (!pendingBind) {
      setModal((m) => ({ ...m, open: false }));
      return;
    }
    const { elderName, careGroupId } = pendingBind;
    try {
      const mapKey = "careGroupMap";
      let map = {};
      const raw = window.localStorage.getItem(mapKey);
      if (raw) {
        try {
          map = JSON.parse(raw) || {};
        } catch {
          map = {};
        }
      }
      map[elderName] = careGroupId;
      window.localStorage.setItem(mapKey, JSON.stringify(map));
      window.localStorage.setItem("currentElderName", elderName);
      window.localStorage.setItem("nurseBoundElderName", elderName);
    } catch {
      // ignore localStorage errors
    }

    setModal((m) => ({
      ...m,
      title: "绑定成功",
      description: `已绑定老人「${elderName}」，后续家属端查看/录入的都是同一位老人。`,
      open: true,
      reloadOnClose: true,
    }));
    setPendingBind(null);
  };

  const startNativeScan = async () => {
    try {
      // 标记进入“扫码模式”，显示黑色遮罩，营造全屏效果
      setScanOpen(true);
      setScanning(true);

      // 使用官方插件的 scanBarcode，一次性拉起原生扫码界面
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: "QR_CODE",
        scanInstructions: "请将取景框对准老人端的房卡二维码",
        scanButton: true,
        scanText: "开始扫描",
      });

      setScanning(false);

      const decodedText = result?.ScanResult || "";
      if (!decodedText) {
        setScanOpen(false);
        return;
      }

      try {
        const data = JSON.parse(decodedText);
        if (data?.type !== "elder-bind" || !data.careGroupId || !data.elderName) {
          throw new Error("二维码内容不符合预期");
        }

        const elderName = String(data.elderName || "").trim();
        const careGroupId = String(data.careGroupId || "").trim();
        if (!elderName || !careGroupId) {
          throw new Error("二维码缺少必要信息");
        }

        setScanOpen(false);
        setPendingBind({ elderName, careGroupId });
        setModal({
          open: true,
          title: "确认绑定老人",
          description: `识别到老人「${elderName}」，是否将本设备绑定到该老人？`,
          reloadOnClose: false,
        });
      } catch {
        setScanOpen(false);
        setPendingBind(null);
        setModal({
          open: true,
          title: "无法识别这个二维码",
          description: "请确认使用的是本应用老人端生成的房卡二维码，然后重试。",
          reloadOnClose: false,
        });
      }
    } catch {
      setScanning(false);
      setScanOpen(false);
      setModal({
        open: true,
        title: "扫码失败",
        description: "启动摄像头时出现问题，请稍后重试。",
        reloadOnClose: false,
      });
    } finally {
      try {
        await BarcodeScanner.stopScan();
      } catch {
        // ignore
      }
    }
  };

  return (
    <div className="relative pb-28">
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        customActions={
          pendingBind ? (
            <div className="flex gap-3">
              <PrimaryButton onClick={handleConfirmBind}>确认绑定</PrimaryButton>
              <PrimaryButton
                variant="ghost"
                onClick={() => {
                  setModal((m) => ({ ...m, open: false }));
                  setPendingBind(null);
                }}
              >
                取消
              </PrimaryButton>
            </div>
          ) : undefined
        }
        onClose={() => {
          setModal((m) => ({ ...m, open: false }));
          if (modal.reloadOnClose) {
            // 关闭提示后刷新一次数据（依赖 careGroupId）更直观
            window.location.reload();
          }
        }}
      />

      <TopBar
        title={
          <span className="text-2xl font-bold tracking-wider bg-gradient-to-r from-slate-700 to-slate-500 bg-clip-text text-transparent drop-shadow-sm">
            家属端
          </span>
        }
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={startNativeScan}
            className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-[#2F74B8] text-white text-sm font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5 text-white" />
            <span>{scanning ? "正在扫码..." : "扫码添加"}</span>
          </button>
        }
      />

      {scanOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md px-4">
            <Card>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionTitle size="md">扫码绑定老人</SectionTitle>
                  <button
                    type="button"
                    onClick={() => setScanOpen(false)}
                    className="text-sm text-gray-500 hover:text-gray-200"
                  >
                    关闭
                  </button>
                </div>
                <div className="text-xs text-gray-200">
                  将摄像头对准老人端「老人名片」中的二维码，即可自动绑定到同一个照护组。
                </div>
                <div id="qr-reader" className="w-full bg-black rounded-xl overflow-hidden" />
              </div>
            </Card>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
        <div className="max-w-md mx-auto bg-white/90 backdrop-blur-lg border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex justify-around items-center px-2 pt-3 pb-6 pointer-events-auto">
          {FAMILY_TABS.map((t) => {
            const isActive = t.id === tab;
            const colorClass = isActive ? "text-blue-600" : "text-gray-400";
            const iconSize = isActive ? "w-6 h-6" : "w-5 h-5";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex-1 flex flex-col items-center gap-1 text-xs"
              >
                <span className={classNames(colorClass, "flex items-center justify-center")}>
                  {t.icon ? <t.icon className={classNames(iconSize)} /> : null}
                </span>
                <span className={colorClass}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {tab === "activity" ? <ElderActivityTab /> : null}
      {tab === "events" ? <ElderEventsTab /> : null}
      {tab === "intake" ? <FamilyIntakeTab /> : null}
      {tab === "manage" ? <FamilyManageTab /> : null}
      {tab === "chat" ? <FamilyChatTab /> : null}
    </div>
  );
}

