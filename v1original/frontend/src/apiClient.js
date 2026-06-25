const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

// ================= careGroupId 多租户支持 =================
function generateCareGroupId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function getCareGroupId() {
  try {
    const mapKey = "careGroupMap";
    const elderKey = "currentElderName";
    const elderName = localStorage.getItem(elderKey) || "";

    // 未登录老人时退回设备级 ID（不会持久映射具体姓名）
    if (!elderName) {
      const key = "deviceCareGroupId";
      let id = localStorage.getItem(key);
      if (!id) {
        id = generateCareGroupId();
        localStorage.setItem(key, id);
      }
      return id;
    }

    let map = {};
    const raw = localStorage.getItem(mapKey);
    if (raw) {
      try {
        map = JSON.parse(raw) || {};
      } catch {
        map = {};
      }
    }

    if (!map[elderName]) {
      map[elderName] = generateCareGroupId();
      localStorage.setItem(mapKey, JSON.stringify(map));
    }

    return map[elderName];
  } catch {
    return generateCareGroupId();
  }
}

function withCareGroupHeaders(init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Care-Group-ID", getCareGroupId());
  return { ...init, headers };
}

export async function fetchOcr({ imageFile, text }) {
  const controller = new AbortController();
  const timeoutMs = 60_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    if (imageFile) form.append("image", imageFile);
    form.append("text", text || "");

    const res = await fetch(
      `${API_BASE}/api/ocr`,
      withCareGroupHeaders({
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
    );

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ? String(data.detail) : "";
      } catch {
        // ignore
      }
      throw new Error(detail || `请求失败（${res.status}）`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAddMedicine({
  bedNo,
  residentName,
  name,
  dosage,
  contra,
  timeList,
  customTime,
  audioFile,
  boxImageFile,
}) {
  const controller = new AbortController();
  const timeoutMs = 35_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append("bed_no", bedNo || "");
    form.append("resident_name", residentName || "");
    form.append("name", name || "");
    form.append("dosage", dosage || "");
    form.append("contra", contra || "");
    form.append("time_select", JSON.stringify(timeList || []));
    form.append("custom_time", customTime || "");
    if (audioFile) {
      form.append("audio_note", audioFile);
    }
    if (boxImageFile) {
      form.append("box_image", boxImageFile);
    }

    const res = await fetch(
      `${API_BASE}/api/add_medicine`,
      withCareGroupHeaders({
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
    );
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ? String(data.detail) : "";
      } catch {
        // ignore
      }
      throw new Error(detail || `请求失败（${res.status}）`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchSchedules() {
  const res = await fetch(
    `${API_BASE}/api/schedules`,
    withCareGroupHeaders(),
  );
  if (!res.ok) {
    throw new Error(`请求失败（${res.status}）`);
  }
  const data = await res.json();
  return Array.isArray(data?.schedules) ? data.schedules : [];
}

/**
 * 一键生成用药提醒：下载 .ics 文件，保证每次点击都有反应（魔搭/iframe 下可靠）。
 * @param {{ bedNo?: string, residentName?: string, days?: number }} opts - 护工端可传 bedNo/residentName 仅生成该老人
 */
export async function fetchIcsReminder(opts = {}) {
  await downloadIcsReminder(opts);
}

/**
 * 获取用药提醒 ics 的完整 URL（用于拉取文件流 / 降级下载）
 */
function getIcsReminderUrl(opts = {}) {
  const { bedNo = "", residentName = "", days = 7 } = opts;
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (bedNo) params.set("bed_no", bedNo);
  if (residentName) params.set("resident_name", residentName);
  const path = `${API_BASE}/api/ics/reminder?${params.toString()}`;
  return path.startsWith("http") ? path : new URL(path, window.location.origin).href;
}

/**
 * 生成提醒按钮的点击逻辑：微信内直接下载 .ics；其他环境先尝试 Web Share，失败则下载 .ics
 */
export async function openIcsInCalendar(opts = {}) {
  const absoluteUrl = getIcsReminderUrl(opts);
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

  if (!isWeChat && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      const response = await fetch(absoluteUrl, withCareGroupHeaders({}));
      if (!response.ok) throw new Error("生成失败");
      const blob = await response.blob();
      const file = new File([blob], "用药提醒.ics", { type: "text/calendar" });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "用药提醒",
          text: "请将此提醒加入您的日历",
        });
        return;
      }
    } catch (e) {
      // 调起系统面板失败，走降级方案
    }
  }

  // 必须用 fetch + header 拉取，否则后端会报缺少 X-Care-Group-ID
  const response = await fetch(absoluteUrl, withCareGroupHeaders({}));
  if (!response.ok) throw new Error("生成失败");
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "用药提醒.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * 下载用药提醒 .ics 文件（备用：若一键导入无反应，可下载后到「文件」里打开）
 */
export async function downloadIcsReminder(opts = {}) {
  const { bedNo = "", residentName = "", days = 7 } = opts;
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (bedNo) params.set("bed_no", bedNo);
  if (residentName) params.set("resident_name", residentName);
  const url = `${API_BASE}/api/ics/reminder?${params.toString()}`;
  const res = await fetch(url, withCareGroupHeaders({}));
  if (!res.ok) throw new Error("生成用药提醒失败");
  const blob = await res.blob();
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = "用药提醒.ics";
  a.click();
  URL.revokeObjectURL(u);
}

/**
 * 一步添加到日历（适配魔搭手机端）：获取 Google/Outlook 预填链接，点击后打开对应日历，在日历里点保存即可。
 * @returns {{ googleUrl: string, outlookUrl: string, summary: string }}
 */
/**
 * 获取用药提醒的日历事件 JSON 列表（供原生日历插件使用）
 */
export async function fetchCalendarEvents(opts = {}) {
  const { bedNo = "", residentName = "", days = 7 } = opts;
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (bedNo) params.set("bed_no", bedNo);
  if (residentName) params.set("resident_name", residentName);
  const url = `${API_BASE}/api/calendar/events?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);
  const res = await fetch(url, withCareGroupHeaders({ signal: controller.signal }));
  clearTimeout(timeoutId);
  if (!res.ok) {
    const hint = res.status === 404 ? "，请检查后端地址（VITE_API_BASE）是否有效" : "";
    throw new Error(`获取日历事件失败（${res.status}）${hint}`);
  }
  const data = await res.json();
  return data?.events || [];
}

export async function fetchCalendarQuickAdd(opts = {}) {
  const { bedNo = "", residentName = "", days = 7 } = opts;
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (bedNo) params.set("bed_no", bedNo);
  if (residentName) params.set("resident_name", residentName);
  const url = `${API_BASE}/api/calendar/quick-add?${params.toString()}`;
  const res = await fetch(url, withCareGroupHeaders({}));
  if (!res.ok) throw new Error("获取日历链接失败");
  const data = await res.json();
  return {
    googleUrl: data.googleUrl || "",
    outlookUrl: data.outlookUrl || "",
    summary: data.summary || "",
  };
}

export async function fetchChat({ message, bedNo, residentName }) {
  const controller = new AbortController();
  const timeoutMs = 35_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append("message", message || "");
    form.append("bed_no", bedNo || "");
    form.append("resident_name", residentName || "");

    const res = await fetch(
      `${API_BASE}/api/chat`,
      withCareGroupHeaders({
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
    );
    if (!res.ok) {
      throw new Error(`请求失败（${res.status}）`);
    }
    const data = await res.json();
    return data?.reply || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchTts(text) {
  const form = new FormData();
  form.append("text", text || "");
  const res = await fetch(
    `${API_BASE}/api/tts`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) {
    throw new Error("TTS 请求失败");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchTranscribe(file) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  const form = new FormData();
  form.append("audio", file);
  try {
    const res = await fetch(
      `${API_BASE}/api/transcribe`,
      withCareGroupHeaders({
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
    );
    if (!res.ok) {
      const hint = res.status === 404 ? "：接口不存在，请检查后端地址" : "";
      throw new Error(`语音识别失败（${res.status}）${hint}`);
    }
    return res.json();
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("语音识别超时，请检查网络或后端服务状态");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchElderAudioChoices() {
  const res = await fetch(
    `${API_BASE}/api/elder_audio_choices`,
    withCareGroupHeaders(),
  );
  if (!res.ok) throw new Error("获取语音叮嘱列表失败");
  const data = await res.json();
  return Array.isArray(data?.choices) ? data.choices : [];
}

export async function fetchElderAudio(drugName) {
  const res = await fetch(
    `${API_BASE}/api/elder_audio?drug_name=${encodeURIComponent(drugName)}`,
    withCareGroupHeaders(),
  );
  if (!res.ok) throw new Error("获取语音叮嘱失败");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchAudioByIndex(index) {
  const res = await fetch(
    `${API_BASE}/api/audio_by_index?index=${encodeURIComponent(index)}`,
    withCareGroupHeaders(),
  );
  if (!res.ok) throw new Error("获取语音失败");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchBoxImage(index) {
  const res = await fetch(
    `${API_BASE}/api/box_image_by_index?index=${encodeURIComponent(index)}`,
    withCareGroupHeaders(),
  );
  if (!res.ok) throw new Error("未找到药盒照片");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchElderToggleTakenSlot(index, timeSlot, taken) {
  const form = new FormData();
  form.append("index", String(index));
  form.append("time_slot", String(timeSlot));
  form.append("taken", String(taken));
  const res = await fetch(
    `${API_BASE}/api/elder_toggle_taken_slot`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) throw new Error("更新已服药状态失败");
  return res.json();
}

export async function fetchNurseToggleTaken(index, taken) {
  const form = new FormData();
  form.append("index", String(index));
  form.append("taken", String(taken));
  const res = await fetch(
    `${API_BASE}/api/nurse_toggle_taken`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) throw new Error("更新已服药状态失败");
  return res.json();
}

/** 家属端服药情况时间轴：只更新该条记录在指定时段的已服药状态 */
export async function fetchNurseToggleTakenSlot(index, timeSlot, taken) {
  const form = new FormData();
  form.append("index", String(index));
  form.append("time_slot", String(timeSlot));
  form.append("taken", String(taken));
  const res = await fetch(
    `${API_BASE}/api/nurse_toggle_taken_slot`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) throw new Error("更新已服药状态失败");
  return res.json();
}

export async function fetchDeleteMedicine(index) {
  const form = new FormData();
  form.append("index", String(index));
  const res = await fetch(
    `${API_BASE}/api/delete_medicine`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : "";
    } catch {
      // ignore
    }
    throw new Error(detail || `请求失败（${res.status}）`);
  }
  return res.json();
}

export async function fetchCheckDrugInteractions({ name, dosage, contra, bedNo, residentName }) {
  const controller = new AbortController();
  const timeoutMs = 35_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append("name", name || "");
    form.append("dosage", dosage || "");
    form.append("contra", contra || "");
    form.append("bed_no", bedNo || "");
    form.append("resident_name", residentName || "");

    const res = await fetch(
      `${API_BASE}/api/check_drug_interactions`,
      withCareGroupHeaders({
        method: "POST",
        body: form,
        signal: controller.signal,
      }),
    );
    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ? String(data.detail) : "";
      } catch {
        // ignore
      }
      throw new Error(detail || `请求失败（${res.status}）`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchAddEvent({ residentName, eventType, title, description, isUrgent, chatContent }) {
  const form = new FormData();
  form.append("resident_name", residentName || "");
  form.append("event_type", eventType || "");
  form.append("title", title || "");
  form.append("description", description || "");
  form.append("is_urgent", isUrgent ? "1" : "0");
  form.append("chat_content", chatContent || "");

  const res = await fetch(
    `${API_BASE}/api/add_event`,
    withCareGroupHeaders({
      method: "POST",
      body: form,
    }),
  );
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : "";
    } catch {
      // ignore
    }
    throw new Error(detail || `请求失败（${res.status}）`);
  }
  return res.json();
}

export async function fetchGetEvents(residentName = "") {
  // 生产环境 API_BASE 为空时用相对路径，避免 new URL 单参数在部分部署环境出错
  const path = "/api/get_events" + (residentName ? `?resident_name=${encodeURIComponent(residentName)}` : "");
  const res = await fetch(
    API_BASE + path,
    withCareGroupHeaders({
      method: "GET",
    }),
  );
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail ? String(data.detail) : "";
    } catch {
      // ignore
    }
    throw new Error(detail || `请求失败（${res.status}）`);
  }
  return res.json();
}
