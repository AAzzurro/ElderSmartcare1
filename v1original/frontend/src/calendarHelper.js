/**
 * 一键生成用药提醒：在原生环境下用日历插件写入系统日历，否则用 ics 下载/分享
 */
import { Capacitor } from "@capacitor/core";
import { fetchSchedules } from "./apiClient";
import { openIcsInCalendar, downloadIcsReminder } from "./apiClient";

const SLOT_TIME_MAP = [
  ["晨起空腹", "06:30"],
  ["早餐前", "07:00"],
  ["早餐中", "08:00"],
  ["早餐后", "09:00"],
  ["午餐前", "11:30"],
  ["午餐中", "12:00"],
  ["午餐后", "13:00"],
  ["晚餐前", "17:30"],
  ["晚餐中", "18:00"],
  ["晚餐后", "19:00"],
  ["睡前", "21:30"],
  ["紧急", "09:00"],
  ["按需", "10:00"],
  ["未设置时间", "09:00"],
];

function parseTimeSlots(raw) {
  if (!raw || typeof raw !== "string") return [];
  const sepCustom = "；注意：";
  const sepOld = "； ";
  let standardTime = raw;
  if (raw.includes(sepCustom)) {
    standardTime = raw.slice(0, raw.indexOf(sepCustom)).trim();
  } else if (raw.includes(sepOld)) {
    standardTime = raw.slice(0, raw.indexOf(sepOld)).trim();
  }
  const slots = standardTime
    .split(/[、；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return slots.length > 0 ? slots : ["未设置时间"];
}

function slotToClock(slot) {
  const s = String(slot || "").trim();
  const directMatch = s.match(/([01]?\d|2[0-3]):([0-5]\d)/);
  if (directMatch) {
    const hh = String(directMatch[1]).padStart(2, "0");
    return `${hh}:${directMatch[2]}`;
  }
  for (const [k, v] of SLOT_TIME_MAP) {
    if (s.includes(k)) return v;
  }
  return "09:00";
}

function buildEventsFromSchedules(rows, opts) {
  const { days = 7, bedNo = "", residentName = "" } = opts;
  const targetBedNo = String(bedNo || "").trim();
  const targetResidentName = String(residentName || "").trim();
  const source = Array.isArray(rows) ? rows : [];
  const filtered = source.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const rowBedNo = String(row["床号"] || "").trim();
    const rowName = String(row["姓名"] || "").trim();
    if (targetBedNo && rowBedNo !== targetBedNo) return false;
    if (targetResidentName && rowName !== targetResidentName) return false;
    return true;
  });

  const list = filtered.length > 0 ? filtered : source;
  const maxDays = Math.max(1, Math.min(31, Number(days) || 7));
  const now = new Date();
  const events = [];

  for (const row of list) {
    const name = String(row["药品名称"] || row.name || "").trim() || "用药";
    const dosage = String(row["用法用量"] || "").trim() || "请按医嘱服用";
    const slots = parseTimeSlots(row["服药时间"]);

    for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      for (const slot of slots) {
        const [hour, minute] = slotToClock(slot).split(":").map((x) => Number(x));
        const start = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hour,
          minute,
          0,
          0
        );
        const end = new Date(start.getTime() + 15 * 60 * 1000);
        events.push({
          title: `${name}`,
          startDate: start.getTime(),
          endDate: end.getTime(),
          description: `用量：${dosage}。请按时服用。（${slot}）`,
        });
      }
    }
  }
  return events;
}

const SUCCESS_MSG = "成功将本周所有用药提醒静默写入日历！";

/**
 * 获取用于静默写入的日历 ID。带上此 ID 调用 createEvent 会直接写库，不弹系统“新建日程”界面。
 * 优先使用默认日历，否则取 listCalendars 的第一项。
 */
async function getCalendarIdForWrite(CapacitorCalendar) {
  try {
    const defaultRes = await CapacitorCalendar.getDefaultCalendar();
    if (defaultRes?.result?.id) return defaultRes.result.id;
  } catch (_) { }
  const listRes = await CapacitorCalendar.listCalendars();
  const calendars = listRes?.result;
  if (Array.isArray(calendars) && calendars.length > 0) {
    const preferred = calendars.find((c) => c.isDefault === true) || calendars[0];
    return preferred?.id || null;
  }
  return null;
}

export async function addRemindersToCalendar(opts = {}) {
  const { days = 7, bedNo = "", residentName = "" } = opts;

  if (!Capacitor.isNativePlatform()) {
    await openIcsInCalendar({ days, bedNo, residentName });
    return;
  }

  try {
    const { CapacitorCalendar, CalendarPermissionScope } = await import("@ebarooni/capacitor-calendar");
    // 1. 运行时权限：同时需要 READ_CALENDAR 和 WRITE_CALENDAR
    const allPerms = await CapacitorCalendar.checkAllPermissions();
    const perms = allPerms?.result || {};
    const canRead = perms[CalendarPermissionScope.READ_CALENDAR] === "granted";
    const canWrite = perms[CalendarPermissionScope.WRITE_CALENDAR] === "granted";
    if (!canRead || !canWrite) {
      const full = await CapacitorCalendar.requestFullCalendarAccess();
      const state = full?.result;
      if (state !== "granted") {
        throw new Error("需要日历权限才能添加提醒，请在系统设置中开启「读取/写入日历」权限。");
      }
    }

    const calendarId = await getCalendarIdForWrite(CapacitorCalendar);

    const schedules = await fetchSchedules();
    const events = buildEventsFromSchedules(schedules, { days, bedNo, residentName });
    if (events.length === 0) {
      throw new Error("暂无用药记录，请先添加药品");
    }

    const toEventOpts = (ev) => {
      const base = {
        title: String(ev.title || "").trim() || "用药提醒",
        startDate: ev.startDate,
        endDate: ev.endDate,
        description: ev.description || "",
      };
      if (calendarId) base.calendarId = calendarId;
      return base;
    };

    let created = 0;
    let firstCreateError = null;
    for (const ev of events) {
      try {
        await CapacitorCalendar.createEvent(toEventOpts(ev));
        created++;
      } catch (e) {
        if (!firstCreateError) firstCreateError = e;
        console.warn("创建日历事件失败:", ev.title, e);
      }
    }
    if (created > 0) {
      return { ok: true, created, message: SUCCESS_MSG };
    }
    try {
      await CapacitorCalendar.createEventWithPrompt(toEventOpts(events[0]));
      return { ok: true, created: 0, prompted: true, message: SUCCESS_MSG };
    } catch (promptErr) {
      const msg = firstCreateError?.message || promptErr?.message || "请检查系统日历是否可用并已授权";
      throw new Error(`未能创建任何日历事件：${msg}`);
    }
  } catch (err) {
    if (Capacitor.isNativePlatform()) {
      throw err;
    }
    await openIcsInCalendar({ days, bedNo, residentName });
  }
}

export { downloadIcsReminder };
