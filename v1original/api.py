"""
智爱助老 - FastAPI 后端接口（前后端分离）
与 core_logic、ai_agents 保持原有业务逻辑一致。
"""
import warnings

# macOS 系统 Python 使用 LibreSSL，urllib3 v2 会打印无害警告；gradio 又要求 urllib3 2.x
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL 1.1.1+")

import json
import tempfile
import os
import time
import mimetypes
import edge_tts
import sys
from pydub import AudioSegment
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from ai_agents import agent_ocr_extract, chat_with_rag, transcribe_audio, check_drug_interactions
from core_logic import (
    add_to_cabinet,
    get_styled_db,
    get_elder_audio,
    get_elder_audio_choices,
    nurse_toggle_taken,
    nurse_toggle_taken_slot,
    tts_read,
)
from db import (
    delete_medicine_by_index,
    insert_event,
    insert_medicine,
    list_events,
    list_medicines,
    update_medicine_taken_by_index,
)
from utils import generate_ics_week, generate_calendar_events_json, get_quick_add_event
from urllib.parse import quote

from pydub import AudioSegment

if sys.platform == "win32":
    # 如果是 Windows (你本地)，就用当前文件夹里的 .exe
    current_dir = os.path.dirname(os.path.abspath(__file__))
    AudioSegment.converter = os.path.join(current_dir, "ffmpeg.exe")
    AudioSegment.ffprobe = os.path.join(current_dir, "ffprobe.exe")
else:
    # 如果是 Linux (魔搭云端)，直接呼叫系统全局的 ffmpeg
    AudioSegment.converter = "ffmpeg"
    AudioSegment.ffprobe = "ffprobe"

app = FastAPI(title="智爱助老-智能用药助手 API", version="1.0.0")

# 允许所有跨域请求（前后端分离）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_care_group_id(care_group_id: Optional[str]) -> str:
    """
    从 Header 中获取 X-Care-Group-ID，并校验租户 ID。
    """
    if not care_group_id:
        raise HTTPException(status_code=400, detail="缺少 X-Care-Group-ID 请求头")
    care_group_id = care_group_id.strip()
    if not care_group_id:
        raise HTTPException(status_code=400, detail="X-Care-Group-ID 不能为空")
    return care_group_id


def get_group_dbs(care_group_id: Optional[str]):
    """
    按 care_group_id 从 SQLite 读取该组用药和事件数据。
    返回普通 list[dict]，保持旧业务逻辑和前端接口兼容。
    """
    group_id = _require_care_group_id(care_group_id)
    return list_medicines(group_id), list_events(group_id, limit=None)


# ---------- POST /api/ocr ----------
@app.post("/api/ocr")
async def api_ocr(
    image: Optional[UploadFile] = File(None),
    text: str = Form(""),
):
    """
    上传图片和/或文本：阶段1 本地 OCR 识别文字，阶段2 LLM 翻译为大白话并结构化。
    返回：status, summary, name, dosage, contra, time, custom_time
    """
    text_input = (text or "").strip()
    if not image and not text_input:
        raise HTTPException(status_code=400, detail="请上传图片或输入文本")

    image_path = None
    if image and image.filename:
        suffix = os.path.splitext(image.filename)[1] or ".jpg"
        fd, path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(await image.read())
            image_path = path
        except Exception:
            os.close(fd)
            raise HTTPException(status_code=500, detail="图片保存失败")

    try:
        status_msg, summary, name, dosage, contra, time_list, custom_time_str = agent_ocr_extract(
            image_path, text_input
        )
        is_medicine = not (
            str(status_msg or "").startswith("❌") or str(status_msg or "").startswith("⚠️")
        )
        return {
            "status": status_msg,
            "is_medicine": is_medicine,
            "summary": summary,
            "name": name,
            "dosage": dosage,
            "contra": contra,
            "time": time_list,
            "custom_time": custom_time_str,
        }
    finally:
        if image_path and os.path.exists(image_path):
            try:
                os.unlink(image_path)
            except Exception:
                pass


# ---------- POST /api/add_medicine ----------
@app.post("/api/add_medicine")
async def api_add_medicine(
    bed_no: str = Form(""),
    resident_name: str = Form(""),
    name: str = Form(...),
    dosage: str = Form(""),
    contra: str = Form(""),
    time_select: str = Form("[]"),
    custom_time: str = Form(""),
    audio_note: Optional[UploadFile] = File(None),
    box_image: Optional[UploadFile] = File(None),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    提交药品信息，调用 add_to_cabinet 写入排班。
    time_select 为 JSON 数组字符串，如 ["早餐后", "睡前"]。
    支持可选上传药盒照片，供用药排班中查看。
    """
    try:
        time_list = json.loads(time_select or "[]")
        if not isinstance(time_list, list):
            time_list = []
    except json.JSONDecodeError:
        time_list = []

    audio_path = None
    if audio_note and audio_note.filename:
        # 将语音备注保存到持久目录，供后续“语音叮嘱”播放使用
        base_dir = os.path.join(os.path.dirname(__file__), "audio_notes")
        os.makedirs(base_dir, exist_ok=True)
        suffix = os.path.splitext(audio_note.filename or "")[1] or ".wav"
        filename = f"note_{int(time.time() * 1000)}{suffix}"
        path = os.path.join(base_dir, filename)
        try:
            with open(path, "wb") as f:
                f.write(await audio_note.read())
            audio_path = path
        except Exception:
            # 如果写入失败，则忽略语音备注，仅保存文字信息
            audio_path = None

    box_image_path = None
    if box_image and box_image.filename:
        # 将药盒照片保存到持久目录
        box_dir = os.path.join(os.path.dirname(__file__), "box_images")
        os.makedirs(box_dir, exist_ok=True)
        suffix = os.path.splitext(box_image.filename or "")[1] or ".jpg"
        filename = f"box_{int(time.time() * 1000)}{suffix}"
        path = os.path.join(box_dir, filename)
        try:
            with open(path, "wb") as f:
                f.write(await box_image.read())
            box_image_path = path
        except Exception:
            box_image_path = None

    group_id = _require_care_group_id(care_group_id)
    med_db = list_medicines(group_id)
    before_count = len(med_db)

    df, msg, ics_path = add_to_cabinet(
        med_db,
        bed_no or "",
        resident_name or "",
        name,
        dosage or "",
        contra or "",
        time_list,
        (custom_time or "").strip(),
        audio_path or "",
        box_image_path or "",
    )
    if len(med_db) > before_count:
        insert_medicine(group_id, med_db[-1])
        df = get_styled_db(list_medicines(group_id))

    # 返回排班表为可 JSON 序列化的列表
    schedules = _dataframe_to_records(df)
    return {
        "message": msg,
        "schedules": schedules,
        "ics_path": ics_path,
    }


# ---------- GET /api/schedules ----------
@app.get("/api/schedules")
async def api_schedules(
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """获取当前全部排班数据（get_styled_db）。"""
    med_db, _ = get_group_dbs(care_group_id)
    df = get_styled_db(med_db)
    return {"schedules": _dataframe_to_records(df)}


# ---------- GET /api/ics/reminder ----------
@app.get("/api/ics/reminder")
async def api_ics_reminder(
    bed_no: str = "",
    resident_name: str = "",
    days: int = 7,
    inline: str = "",
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    一键生成用药提醒：返回从当日开始为期 days 天的 .ics 日历文件。
    inline=1 时返回 Content-Disposition: inline，供「一键导入日历」直接打开，由系统弹出用日历打开并导入。
    """
    bed_no = (bed_no or "").strip()
    resident_name = (resident_name or "").strip()
    days = max(1, min(31, int(days) if isinstance(days, (int, str)) else 7))
    med_db, _ = get_group_dbs(care_group_id)
    if not bed_no and not resident_name:
        medications = list(med_db)
    else:
        medications = [
            m for m in med_db
            if (not bed_no or str(m.get("床号", "")) == bed_no)
            and (not resident_name or str(m.get("姓名", "")) == resident_name)
        ]
    ics_content = generate_ics_week(medications, start_date=None, days=days)
    disposition = "inline" if (str(inline).strip() == "1") else "attachment; filename=medication_reminder.ics"
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": disposition,
        },
    )


# ---------- GET /api/calendar/events ----------
@app.get("/api/calendar/events")
async def api_calendar_events(
    bed_no: str = "",
    resident_name: str = "",
    days: int = 7,
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    返回用药提醒的日历事件 JSON 列表，供原生日历插件 createEvent 使用。
    """
    bed_no = (bed_no or "").strip()
    resident_name = (resident_name or "").strip()
    days = max(1, min(31, int(days) if isinstance(days, (int, str)) else 7))
    med_db, _ = get_group_dbs(care_group_id)
    if not bed_no and not resident_name:
        medications = list(med_db)
    else:
        medications = [
            m for m in med_db
            if (not bed_no or str(m.get("床号", "")) == bed_no)
            and (not resident_name or str(m.get("姓名", "")) == resident_name)
        ]
    events = generate_calendar_events_json(medications, start_date=None, days=days)
    return {"events": events}


# ---------- GET /api/calendar/quick-add ----------
@app.get("/api/calendar/quick-add")
async def api_calendar_quick_add(
    bed_no: str = "",
    resident_name: str = "",
    days: int = 7,
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    为手机端（魔搭）提供「一步添加到日历」链接：返回 Google 日历、Outlook 的预填事件 URL。
    用户点击后跳转到对应日历，在日历里点保存即可，无需先下载 ics 再打开。
    """
    bed_no = (bed_no or "").strip()
    resident_name = (resident_name or "").strip()
    days = max(1, min(31, int(days) if isinstance(days, (int, str)) else 7))
    med_db, _ = get_group_dbs(care_group_id)
    if not bed_no and not resident_name:
        medications = list(med_db)
    else:
        medications = [
            m for m in med_db
            if (not bed_no or str(m.get("床号", "")) == bed_no)
            and (not resident_name or str(m.get("姓名", "")) == resident_name)
        ]
    ev = get_quick_add_event(medications, start_date=None, days=days)
    if not ev:
        return {"googleUrl": "", "outlookUrl": "", "summary": "暂无用药记录"}

    title = ev["title"]
    desc = ev["description"]
    # Google: dates 用 YYYYMMDDTHHmmSS（本地时间）
    start_dt = ev["start_iso"].replace("-", "").replace(":", "")[:15]
    end_dt = ev["end_iso"].replace("-", "").replace(":", "")[:15]
    google_url = (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote(title)}"
        f"&dates={start_dt}/{end_dt}"
        f"&details={quote(desc)}"
    )
    # Outlook: startdt/enddt 用 ISO YYYY-MM-DDTHH:mm:00
    start_iso = ev["start_iso"][:16].replace("T", "T")
    end_iso = ev["end_iso"][:16].replace("T", "T")
    outlook_url = (
        "https://outlook.live.com/owa/?path=/calendar/action/compose"
        f"&subject={quote(title)}"
        f"&startdt={quote(start_iso)}"
        f"&enddt={quote(end_iso)}"
        f"&body={quote(desc)}"
    )
    return {"googleUrl": google_url, "outlookUrl": outlook_url, "summary": ev["title"]}


# ---------- POST /api/chat ----------
@app.post("/api/chat")
async def api_chat(
    message: str = Form(...),
    bed_no: str = Form(""),
    resident_name: str = Form(""),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    发送咨询内容，结合当前 care_group 的用药档案（按床号/姓名筛选）与云端知识库，调用 chat_with_rag 返回医生回答。
    """
    med_db, _ = get_group_dbs(care_group_id)
    history = []
    gen = chat_with_rag(
        (message or "").strip(),
        history,
        med_db,
        bed_no=(bed_no or "").strip(),
        resident_name=(resident_name or "").strip(),
    )
    # 消费生成器，取最后一轮 history 中的助手回复
    for _, new_history in gen:
        history = new_history
    reply = ""
    if history and isinstance(history[-1], dict) and history[-1].get("role") == "assistant":
        reply = (history[-1].get("content") or "").strip()
    return {"reply": reply}

@app.post("/api/tts")
async def text_to_speech(text: str = Form(...)):
    try:
        # 1. 创建一个临时的 MP3 文件用来存声音
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        temp_file.close()
        
        # 2. 调用微软 Edge-TTS（zh-CN-XiaoxiaoNeural 是极其温柔自然的中文女声）
        communicate = edge_tts.Communicate(text, "zh-CN-XiaoxiaoNeural")
        
        # 3. 生成并保存音频文件
        await communicate.save(temp_file.name)
        
        # 4. 把热乎的 MP3 文件直接吐给前端播放
        return FileResponse(temp_file.name, media_type="audio/mpeg", filename="tts.mp3")
        
    except Exception as e:
        print(f"TTS 语音合成报错: {str(e)}")
        return {"detail": f"语音生成失败: {str(e)}"}

@app.post("/api/transcribe")
async def api_transcribe(audio: UploadFile = File(...)):
    """
    上传语音文件，调用 ai_agents.transcribe_audio 返回识别文本。
    """
    suffix = os.path.splitext(audio.filename or "")[1] or ".wav"
    fd, path = tempfile.mkstemp(suffix=suffix)
    wav_path = None
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(await audio.read())
        # 浏览器 webm/opus 等非常规格式才转码，原生 aac/m4a/wav/mp3 直接识别以加快速度
        convert_path = path
        ext = os.path.splitext(path)[1].lower()
        if ext not in (".wav", ".mp3", ".m4a", ".aac", ".mp4", ".mpeg"):
            try:
                audio_seg = AudioSegment.from_file(path)
                fd_wav, wav_path = tempfile.mkstemp(suffix=".wav")
                os.close(fd_wav)
                audio_seg.export(wav_path, format="wav")
                convert_path = wav_path
            except Exception as e:
                print(f"语音文件转码失败，直接使用原文件进行识别: {e!r}")

        text = transcribe_audio(convert_path)
        return {"text": text}
    finally:
        if os.path.exists(path):
            try:
                os.unlink(path)
            except Exception:
                pass
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except Exception:
                pass


# ---------- POST /api/check_drug_interactions ----------
@app.post("/api/check_drug_interactions")
async def api_check_drug_interactions(
    name: str = Form(...),
    dosage: str = Form(""),
    contra: str = Form(""),
    bed_no: str = Form(""),
    resident_name: str = Form(""),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    检查新药与当前 care_group 内已有用药的相互作用风险。
    """
    med_db, _ = get_group_dbs(care_group_id)
    result = check_drug_interactions(
        name,
        dosage or "",
        contra or "",
        med_db,
        (bed_no or "").strip(),
        (resident_name or "").strip(),
    )
    return result

@app.get("/api/elder_audio_choices")
async def api_elder_audio_choices(
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    返回当前有语音叮嘱的药品名称列表（按 care_group_id 隔离）。
    """
    med_db, _ = get_group_dbs(care_group_id)
    return {"choices": get_elder_audio_choices(med_db)}


@app.get("/api/elder_audio")
async def api_elder_audio(
    drug_name: str,
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    根据药品名称返回对应的语音叮嘱音频。
    """
    med_db, _ = get_group_dbs(care_group_id)
    path = get_elder_audio(drug_name, med_db)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="未找到语音叮嘱")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "audio/mpeg", filename=os.path.basename(path))


@app.post("/api/elder_toggle_taken_slot")
async def api_elder_toggle_taken_slot(
    index: int = Form(...),
    time_slot: str = Form(...),
    taken: bool = Form(...),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    老人端时间轴：按时段勾选已服用。
    """
    group_id = _require_care_group_id(care_group_id)
    med_db = list_medicines(group_id)
    if 0 <= index < len(med_db):
        nurse_toggle_taken_slot(str(index), time_slot, taken, med_db)
        update_medicine_taken_by_index(group_id, index, med_db[index].get("已服药", {}))
    df = get_styled_db(list_medicines(group_id))
    return {"schedules": _dataframe_to_records(df)}


@app.post("/api/nurse_toggle_taken")
async def api_nurse_toggle_taken(
    index: int = Form(...),
    taken: bool = Form(...),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    勾选“已发药/已服用”，更新 MEDICINE_DB（护工端：所有时段同时更新），按 care_group_id 隔离。
    """
    group_id = _require_care_group_id(care_group_id)
    med_db = list_medicines(group_id)
    card_md = nurse_toggle_taken(str(index), taken, med_db)
    if 0 <= index < len(med_db):
        update_medicine_taken_by_index(group_id, index, med_db[index].get("已服药", {}))
    # 顺带返回最新排班表，方便前端同步状态
    df = get_styled_db(list_medicines(group_id))
    return {
        "card_markdown": card_md,
        "schedules": _dataframe_to_records(df),
    }


@app.post("/api/nurse_toggle_taken_slot")
async def api_nurse_toggle_taken_slot(
    index: int = Form(...),
    time_slot: str = Form(...),
    taken: bool = Form(...),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    家属端服药情况时间轴：只更新该条记录在指定时段的已服药状态，不影响其他时段；按 care_group_id 隔离。
    """
    group_id = _require_care_group_id(care_group_id)
    med_db = list_medicines(group_id)
    if 0 <= index < len(med_db):
        nurse_toggle_taken_slot(str(index), time_slot, taken, med_db)
        update_medicine_taken_by_index(group_id, index, med_db[index].get("已服药", {}))
    df = get_styled_db(list_medicines(group_id))
    return {"schedules": _dataframe_to_records(df)}


@app.get("/api/audio_by_index")
async def api_audio_by_index(
    index: int,
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    根据排班行索引，直接返回对应的语音叮嘱文件（如有）。
    """
    med_db, _ = get_group_dbs(care_group_id)
    if index < 0 or index >= len(med_db):
        raise HTTPException(status_code=404, detail="索引超出范围")
    # 语音文件路径存储在 core_logic.MEDICINE_DB 的 "语音文件" 字段中
    path = med_db[index].get("语音文件") or ""
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="未找到语音叮嘱")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "audio/mpeg", filename=os.path.basename(path))


@app.get("/api/box_image_by_index")
async def api_box_image_by_index(
    index: int,
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    根据排班行索引，返回对应的药盒照片（如有）。
    """
    med_db, _ = get_group_dbs(care_group_id)
    if index < 0 or index >= len(med_db):
        raise HTTPException(status_code=404, detail="索引超出范围")
    path = med_db[index].get("药盒图片") or ""
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="未找到药盒照片")
    media_type, _ = mimetypes.guess_type(path)
    return FileResponse(path, media_type=media_type or "image/jpeg", filename=os.path.basename(path))


@app.post("/api/delete_medicine")
async def api_delete_medicine(
    index: int = Form(...),
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    根据排班行索引删除一条用药记录。
    返回最新的排班列表。
    """
    group_id = _require_care_group_id(care_group_id)
    if index < 0 or not delete_medicine_by_index(group_id, index):
        raise HTTPException(status_code=404, detail="索引超出范围")

    df = get_styled_db(list_medicines(group_id))
    return {
        "schedules": _dataframe_to_records(df),
    }


@app.post("/api/add_event")
async def api_add_event(
    resident_name: str = Form(...),
    event_type: str = Form(...),  # "add_medicine", "drug_conflict", "ask_doctor"
    title: str = Form(...),
    description: str = Form(""),
    is_urgent: str = Form("0"),  # "0" 或 "1"
    chat_content: str = Form(""),  # 问大夫时，保存聊天内容
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    添加一个老人事件。
    - event_type: "add_medicine"(患者添加药品), "drug_conflict"(冲突警告), "ask_doctor"(问大夫)
    - is_urgent: "1" 表示紧急（冲突警告时为 "1"，显示红色）, "0" 表示不紧急
    """
    group_id = _require_care_group_id(care_group_id)

    event = {
        "resident_name": resident_name.strip(),
        "event_type": event_type,
        "title": title,
        "description": description,
        "is_urgent": is_urgent == "1",  # 转换为布尔值
        "chat_content": chat_content,
        "timestamp": time.time(),
    }
    insert_event(group_id, event)
    return {"success": True, "message": "事件已记录"}


@app.get("/api/get_events")
async def api_get_events(
    resident_name: str = "",
    care_group_id: Optional[str] = Header(None, alias="X-Care-Group-ID"),
):
    """
    查询指定老人的事件列表。
    如果 resident_name 为空，返回所有事件。
    """
    group_id = _require_care_group_id(care_group_id)
    events = list_events(group_id, resident_name=resident_name.strip(), limit=50)
    return {"events": events}


def _dataframe_to_records(df):
    """将 DataFrame 转为可 JSON 序列化的 list[dict]（NaN 转为 null），并附加 _index。"""
    df = df.reset_index().rename(columns={"index": "_index"})
    return json.loads(df.to_json(orient="records", date_format="iso"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


import os
import zipfile
import shutil
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ==========================================
# 🌟 无敌版前端挂载逻辑：启动时自动解压并寻找网页
# ==========================================

# 1. 自动拆快递（解压 dist.zip）
zip_name = "dist.zip"  # 如果你传的压缩包改名了（比如 dist_v6.zip），请在这里同步修改
extract_path = os.path.join(os.path.dirname(__file__), "frontend")

if os.path.exists(zip_name):
    print(f"📦 发现 {zip_name}，正在自动解压前端网页...")
    # 清空旧废墟
    if os.path.exists(extract_path):
        shutil.rmtree(extract_path)
    os.makedirs(extract_path, exist_ok=True)
    # 解压新包
    with zipfile.ZipFile(zip_name, 'r') as zip_ref:
        zip_ref.extractall(extract_path)
    print("✅ 前端网页解压完毕！")

# 2. 智能寻找 index.html 的真实位置
# 有时候压缩包里自带一层 dist 文件夹，有时候没有，咱们做个智能判断
if os.path.exists(os.path.join(extract_path, "dist", "index.html")):
    frontend_dist = os.path.join(extract_path, "dist")
else:
    frontend_dist = extract_path

# 3. 挂载网页
if os.path.exists(os.path.join(frontend_dist, "index.html")):
    # 挂载静态资源 (JS, CSS)
    assets_path = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    # 捕获所有路由，返回 React 的 index.html
    @app.get("/{catchall:path}")
    async def serve_react_app(catchall: str):
        return FileResponse(os.path.join(frontend_dist, "index.html"))
        
    print(f"🚀 前端页面挂载成功，随时可以访问！")
else:
    print("⚠️ 致命警告: 依然找不到 index.html，请检查压缩包里面的结构！")