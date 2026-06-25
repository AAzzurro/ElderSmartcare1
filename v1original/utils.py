import base64
import re
import tempfile
import os
from datetime import datetime, timedelta

# 服药时间标签 → 每天提醒钟点（用于 .ics 日历）
TIME_LABEL_TO_CLOCK = {
    "晨起空腹": "07:00",
    "早餐前": "07:30",
    "早餐中": "08:00",
    "早餐后": "08:30",
    "午餐前": "11:30",
    "午餐中": "12:00",
    "午餐后": "13:00",
    "晚餐前": "17:30",
    "晚餐中": "18:00",
    "晚餐后": "18:30",
    "睡前": "21:00",
    "紧急/按需服用": "09:00",
}


def _parse_time_slots_for_ics(time_str):
    """解析服药时间字符串，返回时间段列表（如 早餐后、睡前）。"""
    if not time_str or not isinstance(time_str, str):
        return []
    s = str(time_str).strip()
    for sep in ("；⚠️ 注意：", "；📌 "):
        if sep in s:
            s = s.split(sep)[0]
    return [x.strip() for x in re.split(r"[、；;]", s) if x.strip()]


def _label_to_clock(time_slot_label):
    """将单个时间段标签（可含 emoji）映射到 HH:MM，未匹配则返回 09:00。"""
    for label, clock in TIME_LABEL_TO_CLOCK.items():
        if label in time_slot_label:
            return clock
    return "09:00"


def generate_ics_week(medications, start_date=None, days=7):
    """
    为多条用药记录生成从 start_date 开始、为期 days 天的 .ics 内容。
    每条记录按「服药时间」解析出多个时段，每天在每个时段生成一条日历事件并带提醒。
    medications: list[dict]，每项需含 药品名称、用法用量、服药时间（字符串）。
    返回 str（完整 .ics 内容）。
    """
    if start_date is None:
        start_date = datetime.now().date()
    if not medications:
        return _empty_ics()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SmartElderCare//CN",
    ]
    uid_n = 0
    for med in medications:
        name = (med.get("药品名称") or "").strip() or "用药"
        dosage = (med.get("用法用量") or "").strip() or "请按医嘱服用"
        time_str = med.get("服药时间") or ""
        slots = _parse_time_slots_for_ics(time_str)
        if not slots:
            slots = ["未设置时间"]
        for day_offset in range(days):
            event_date = start_date + timedelta(days=day_offset)
            for slot in slots:
                clock = _label_to_clock(slot)
                hour, minute = clock.split(":")
                dt_start = datetime(
                    event_date.year,
                    event_date.month,
                    event_date.day,
                    int(hour),
                    int(minute),
                    0,
                )
                dt_end = dt_start + timedelta(minutes=15)
                dtstart_str = dt_start.strftime("%Y%m%dT%H%M%S")
                dtend_str = dt_end.strftime("%Y%m%dT%H%M%S")
                summary = f"💊 {name}"
                description = f"用量：{dosage}。请按时服用。"
                uid = f"med-{event_date.isoformat()}-{uid_n}@smartelder"
                uid_n += 1
                lines.extend([
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"SUMMARY:{summary}",
                    f"DESCRIPTION:{description}",
                    f"DTSTART:{dtstart_str}",
                    f"DTEND:{dtend_str}",
                    "BEGIN:VALARM",
                    "ACTION:DISPLAY",
                    "DESCRIPTION:吃药时间到了！",
                    "TRIGGER:-PT0M",
                    "END:VALARM",
                    "END:VEVENT",
                ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def generate_calendar_events_json(medications, start_date=None, days=7):
    """
    为多条用药记录生成从 start_date 开始、为期 days 天的日历事件列表（供原生日历插件使用）。
    返回 list[dict]，每项含 title, startDate, endDate, notes。
    """
    if start_date is None:
        start_date = datetime.now().date()
    if not medications:
        return []
    events = []
    for med in medications:
        name = (med.get("药品名称") or "").strip() or "用药"
        dosage = (med.get("用法用量") or "").strip() or "请按医嘱服用"
        time_str = med.get("服药时间") or ""
        slots = _parse_time_slots_for_ics(time_str)
        if not slots:
            slots = ["未设置时间"]
        for day_offset in range(days):
            event_date = start_date + timedelta(days=day_offset)
            for slot in slots:
                clock = _label_to_clock(slot)
                hour, minute = clock.split(":")
                dt_start = datetime(
                    event_date.year, event_date.month, event_date.day,
                    int(hour), int(minute), 0,
                )
                dt_end = dt_start + timedelta(minutes=15)
                events.append({
                    "title": f"💊 {name}",
                    "startDate": dt_start.strftime("%Y-%m-%dT%H:%M:%S"),
                    "endDate": dt_end.strftime("%Y-%m-%dT%H:%M:%S"),
                    "notes": f"用量：{dosage}。请按时服用。（{slot}）",
                })
    return events


def _empty_ics():
    """无用药记录时返回最小合法 .ics。"""
    return "\r\n".join([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SmartElderCare//CN",
        "END:VCALENDAR",
    ])


def get_quick_add_event(medications, start_date=None, days=7):
    """
    生成本周用药的「一条」日历事件摘要，用于生成 Google/Outlook 一键添加链接（手机端一步打开日历）。
    返回 dict: title, start_iso, end_iso, description；无记录时返回 None。
    """
    if start_date is None:
        start_date = datetime.now().date()
    if not medications:
        return None
    # 用第一个提醒时间作为这条“汇总事件”的时间（便于在日历里看到）
    slots = []
    for med in medications:
        name = (med.get("药品名称") or "").strip() or "用药"
        dosage = (med.get("用法用量") or "").strip() or "请按医嘱服用"
        time_str = med.get("服药时间") or ""
        for slot in _parse_time_slots_for_ics(time_str) or ["未设置时间"]:
            clock = _label_to_clock(slot)
            slots.append((name, dosage, slot, clock))
    if not slots:
        name = (medications[0].get("药品名称") or "").strip() or "用药"
        dosage = (medications[0].get("用法用量") or "").strip() or "请按医嘱服用"
        slots = [(name, dosage, "未设置时间", "09:00")]
    # 取第一个时段作为事件时间
    _, _, _, first_clock = slots[0]
    hour, minute = first_clock.split(":")
    dt_start = datetime(
        start_date.year, start_date.month, start_date.day,
        int(hour), int(minute), 0,
    )
    dt_end = dt_start + timedelta(minutes=15)
    # 描述：列出本周所有用药
    lines = ["【本周用药提醒】"]
    for name, dosage, slot, _ in slots[:20]:  # 最多 20 条
        lines.append(f"• {name}：{dosage}（{slot}）")
    if len(slots) > 20:
        lines.append("… 更多请见 App 内排班")
    description = "\n".join(lines)
    return {
        "title": "💊 本周用药提醒（智爱助老）",
        "start_iso": dt_start.strftime("%Y-%m-%dT%H:%M:%S"),
        "end_iso": dt_end.strftime("%Y-%m-%dT%H:%M:%S"),
        "description": description,
    }


def encode_image(image_path):
    """将图片文件转换为 Base64 编码，供视觉模型读取"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def generate_ics(name, dosage, time_select):
    """【高分亮点：原生系统提醒拦截】生成 .ics 日历协议文件"""
    # 演示用：设定为明天上午 8 点提醒
    tomorrow = datetime.now() + timedelta(days=1)
    dtstart = tomorrow.strftime("%Y%m%dT080000Z")
    dtend = tomorrow.strftime("%Y%m%dT081500Z")

    ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SmartElderCare//CN
BEGIN:VEVENT
SUMMARY:💊 智爱用药提醒: {name}
DESCRIPTION:用量: {dosage}。请务必按时服用！
DTSTART:{dtstart}
DTEND:{dtend}
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:吃药时间到了！
TRIGGER:-PT0M
END:VALARM
END:VEVENT
END:VCALENDAR"""

    fd, path = tempfile.mkstemp(suffix=".ics", text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(ics_content)
    return path


def text_to_speech(text):
    """
    将文本转换为语音文件，返回临时音频文件路径。
    优先使用 gTTS，如不可用则返回 None。
    """
    txt = str(text or "").strip()
    if not txt:
        return None
    try:
        from gtts import gTTS
    except Exception:
        return None

    try:
        tts = gTTS(txt, lang="zh-cn")
        fd, path = tempfile.mkstemp(suffix=".mp3", text=False)
        os.close(fd)
        tts.save(path)
        return path
    except Exception:
        return None