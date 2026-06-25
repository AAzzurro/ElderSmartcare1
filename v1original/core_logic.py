import re
import gradio as gr
import pandas as pd

from config import MEDICINE_DB
from utils import generate_ics, text_to_speech
from ai_agents import chat_with_rag


def add_to_cabinet(
    med_db,
    bed_no,
    resident_name,
    name,
    dosage,
    contra,
    time_select,
    custom_time,
    audio_note,
    box_image="",
):
    if not name or name == "未提取到":
        return get_styled_db(med_db), "❌ 药名为空，排班失败", None

    note_status = "🎵 有语音叮嘱" if audio_note else "无"

    time_str = "、".join(time_select) if isinstance(time_select, list) else str(time_select)
    if custom_time and str(custom_time).strip():
        time_str = (
            f"{time_str}；⚠️ 注意：{custom_time.strip()}"
            if time_str
            else f"⚠️ 注意：{custom_time.strip()}"
        )

    med_db.append(
        {
            "床号": bed_no or "",
            "姓名": resident_name or "",
            "药品名称": name,
            "用法用量": dosage,
            "识别禁忌": contra,
            "服药时间": time_str,
            "护工备注": note_status,
            "语音文件": audio_note or "",
            "药盒图片": box_image or "",
            "已服药": {},  # 按时段存储：{"早餐后": True, "睡前": False}
        }
    )

    ics_file_path = generate_ics(name, dosage, time_str)
    return get_styled_db(med_db), f"✅ 【{name}】已加入排班表！", ics_file_path


def get_styled_db(med_db=None):
    if med_db is None:
        med_db = MEDICINE_DB

    if not med_db:
        return pd.DataFrame(
            columns=[
                "床号",
                "姓名",
                "药品名称",
                "用法用量",
                "识别禁忌",
                "服药时间",
                "护工备注",
                "语音文件",
                "药盒图片",
                "已服药",
            ]
        )

    df = pd.DataFrame(med_db)

    if "床号" not in df.columns:
        df["床号"] = ""
    if "姓名" not in df.columns:
        df["姓名"] = ""
    if "语音文件" not in df.columns:
        df["语音文件"] = ""
    if "药盒图片" not in df.columns:
        df["药盒图片"] = ""
    if "已服药" not in df.columns:
        df["已服药"] = {}

    return df


def _parse_time_slots(time_str):
    """解析服药时间字符串，返回时间段列表。"""
    if not time_str or not isinstance(time_str, str):
        return []
    s = str(time_str)
    for sep in ("；⚠️ 注意：", "；📌 "):
        if sep in s:
            s = s.split(sep)[0]
    return [x.strip() for x in re.split(r"[、；;]", s) if x.strip()] or ["未设置时间"]


def _ensure_taken_dict(row):
    """确保 已服药 为 dict 格式，兼容旧的 bool 格式。"""
    v = row.get("已服药", {})
    if isinstance(v, bool):
        slots = _parse_time_slots(row.get("服药时间", ""))
        return {slot: v for slot in slots}
    return v if isinstance(v, dict) else {}


def is_taken_at_slot(row, time_slot):
    """判断某记录在指定时段是否已服用。"""
    v = row.get("已服药", {})
    if isinstance(v, bool):
        return v
    if isinstance(v, dict):
        return bool(v.get(time_slot, False))
    return False


def filter_db_by_resident(resident_keyword):
    """
    兼容旧实现：按姓名或床号关键字模糊过滤排班表。
    关键字为空时返回完整表；若无匹配则返回空表。
    """
    df = get_styled_db()
    kw = str(resident_keyword or "").strip()
    if not kw:
        return df

    cols = []
    if "床号" in df.columns:
        cols.append("床号")
    if "姓名" in df.columns:
        cols.append("姓名")
    if not cols:
        return df

    mask = False
    for c in cols:
        col_mask = df[c].astype(str).str.contains(kw)
        mask = col_mask if isinstance(mask, bool) else (mask | col_mask)
    if not mask.any():
        return df.iloc[0:0]
    return df[mask]


def get_all_schedules():
    """同时返回两份完整排班表，供老人视图和护工视图刷新使用。"""
    df = get_styled_db()
    return df, df


def add_and_get_both(
    resident,
    name,
    dosage,
    contra,
    time_select,
    custom_time,
    audio_note,
):
    """
    包装 add_to_cabinet，同时返回两份排班表（老人视图 + 护工视图），
    以及提示信息和 .ics 文件路径。
    """
    df, msg, ics_path = add_to_cabinet(
        resident,
        name,
        dosage,
        contra,
        time_select,
        custom_time,
        audio_note,
    )
    return df, df, msg, ics_path


def go_elder():
    """入口页跳转到老人端应用。"""
    return (
        gr.update(visible=False),
        gr.update(visible=True),
        gr.update(visible=False),
    )


def go_nurse():
    """入口页跳转到护工端应用。"""
    return (
        gr.update(visible=False),
        gr.update(visible=False),
        gr.update(visible=True),
    )


def get_elder_view_df():
    """老人端视图使用的排班表：只展示药相关字段，不显示老人姓名/床号与服药勾选。"""
    df = get_styled_db()
    cols = [c for c in df.columns if c not in ("床号", "姓名", "语音文件", "已服药")]
    return df[cols]


def build_elder_reminder_html():
    """构建老人端用药提醒的竖向卡片 HTML。"""
    df = get_elder_view_df()
    if df.empty:
        return "<p>当前还没有已录入的用药卡片。</p>"

    cards = []
    for _, row in df.iterrows():
        name = row.get("药品名称", "")
        dosage = row.get("用法用量", "")
        contra = row.get("识别禁忌", "")
        time_str = row.get("服药时间", "")
        note = row.get("护工备注", "")
        card = f"""
<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin-bottom:10px;background:#f9fafb;">
  <div><strong>药品名称：</strong>{name}</div>
  <div><strong>用法用量：</strong>{dosage}</div>
  <div><strong>服药时间：</strong>{time_str}</div>
  <div><strong>禁忌提示：</strong>{contra}</div>
  <div><strong>语音叮嘱状态：</strong>{note}</div>
</div>
"""
        cards.append(card)
    return "".join(cards)


def get_elder_audio_choices(med_db=None):
    """获取老人端可供选择收听语音叮嘱的药品列表。"""
    df = get_styled_db(med_db)
    if df.empty:
        return []
    names = [str(x) for x in df.get("药品名称", []) if str(x).strip()]
    seen = set()
    uniq = []
    for n in names:
        if n not in seen:
            seen.add(n)
            uniq.append(n)
    return uniq


def refresh_elder_reminder(med_db=None):
    """刷新老人端用药提醒：返回竖排 HTML 和下拉选项列表。"""
    html = build_elder_reminder_html()
    choices = get_elder_audio_choices(med_db)
    return html, gr.update(choices=choices)


def get_elder_audio(drug_name, med_db=None):
    """根据药品名称返回对应的语音叮嘱文件路径（若有则播放最新一条）。"""
    name = str(drug_name or "").strip()
    if not name:
        return None
    df = get_styled_db(med_db)
    if df.empty or "语音文件" not in df.columns:
        return None
    sub = df[df["药品名称"].astype(str) == name]
    if sub.empty:
        return None
    audio_path = sub.iloc[-1].get("语音文件", "") or ""
    return audio_path or None


def build_nurse_choices(bed_kw, name_kw):
    """护工端用药管理系统：按床号 AND 姓名同时过滤，生成可选用药记录列表。"""
    df = get_styled_db()
    bed_kw = str(bed_kw or "").strip()
    name_kw = str(name_kw or "").strip()

    if df.empty:
        return (
            gr.update(choices=[], value=[]),
            "当前没有任何用药记录。",
            None,
            False,
            "",
        )

    mask = pd.Series([True] * len(df))
    if bed_kw and "床号" in df.columns:
        mask &= df["床号"].astype(str).str.contains(bed_kw)
    if name_kw and "姓名" in df.columns:
        mask &= df["姓名"].astype(str).str.contains(name_kw)

    df = df[mask]
    if df.empty:
        return (
            gr.update(choices=[], value=[]),
            "没有匹配到符合条件的用药记录。",
            None,
            False,
            "",
        )

    choices = []
    for idx, row in df.iterrows():
        label = f"{idx}｜{row.get('床号','')} {row.get('姓名','')} - {row.get('药品名称','')}"
        choices.append(label)

    # 默认不选中任何一条
    return gr.update(choices=choices, value=[]), "当前没有选中的用药记录。", None, False, ""


def load_nurse_card(choices):
    """
    根据 CheckboxGroup 勾选结果，生成详情卡片 + 语音 + 已服药状态 + 索引。
    - 勾选至少一条：使用最后一条作为当前记录
    - 全部取消勾选：收起卡片
    """
    if not choices:
        return "当前没有选中的用药记录。", None, False, ""

    choice_value = choices[-1]
    idx_str = str(choice_value).split("｜", 1)[0]

    try:
        idx = int(idx_str)
    except ValueError:
        return "当前没有选中的用药记录。", None, False, ""

    df = get_styled_db()
    if idx < 0 or idx >= len(df):
        return "当前没有选中的用药记录。", None, False, ""

    row = df.iloc[idx]
    audio_path = row.get("语音文件", "") or None
    v = row.get("已服药", {})
    if isinstance(v, bool):
        taken = v
    else:
        slots = _parse_time_slots(row.get("服药时间", ""))
        taken = any(v.get(s, False) for s in slots) if isinstance(v, dict) else False

    card_md = f"""
**床号**：{row.get('🛏️ 床号', '')}

**姓名**：{row.get('姓名', '')}

**药品名称**：{row.get('药品名称', '')}

**用法用量**：{row.get('用法用量', '')}

**服药时间**：{row.get('服药时间', '')}

**禁忌提示**：{row.get('识别禁忌', '')}

**护工备注**：{row.get('护工备注', '')}

**是否已服药**：{"✅ 是" if taken else "❌ 否"}
"""
    return card_md, audio_path, taken, str(idx)


def nurse_toggle_taken_slot(idx_str, time_slot, taken, med_db=None):
    """老人端时间轴：按时段勾选已服用。"""
    if med_db is None:
        med_db = MEDICINE_DB
    try:
        i = int(idx_str)
    except (TypeError, ValueError):
        return
    if i < 0 or i >= len(med_db):
        return
    row = med_db[i]
    d = _ensure_taken_dict(row)
    d[str(time_slot)] = bool(taken)
    row["已服药"] = d


def nurse_toggle_taken(idx_str, taken, med_db=None):
    """护工端：勾选是否已服药后，更新该记录所有时段。"""
    if med_db is None:
        med_db = MEDICINE_DB
    try:
        i = int(idx_str)
    except (TypeError, ValueError):
        return "当前没有选中的用药记录。"
    if i < 0 or i >= len(med_db):
        return "当前没有选中的用药记录。"

    row = med_db[i]
    slots = _parse_time_slots(row.get("服药时间", ""))
    row["已服药"] = {s: bool(taken) for s in slots}

    df = get_styled_db(med_db)
    row = df.iloc[i]
    card_md = f"""
**床号**：{row.get('床号', '')}

**姓名**：{row.get('姓名', '')}

**药品名称**：{row.get('药品名称', '')}

**用法用量**：{row.get('用法用量', '')}

**服药时间**：{row.get('服药时间', '')}

**禁忌提示**：{row.get('识别禁忌', '')}

**护工备注**：{row.get('护工备注', '')}

**是否已服药**：{"✅ 是" if bool(taken) else "❌ 否"}
"""
    return card_md


def elder_add(
    name,
    dosage,
    contra,
    time_select,
    custom_time,
    audio_note,
    box_image="",
):
    """老人端添加用药：无需填写老人信息，所有药默认属于当前使用者。"""
    df, msg, ics_path = add_to_cabinet(
        MEDICINE_DB,
        "",
        "",
        name,
        dosage,
        contra,
        time_select,
        custom_time,
        audio_note,
        box_image or "",
    )
    html, dropdown_update = refresh_elder_reminder()
    return html, dropdown_update, msg, ics_path


def nurse_add_and_refresh(
    bed_no,
    resident_name,
    name,
    dosage,
    contra,
    time_select,
    custom_time,
    audio_note,
    box_image="",
):
    """护工端添加用药：写入后刷新列表与卡片。"""
    _, msg, ics_path = add_to_cabinet(
        MEDICINE_DB,
        bed_no,
        resident_name,
        name,
        dosage,
        contra,
        time_select,
        custom_time,
        audio_note,
        box_image or "",
    )
    radio_update, card_md, audio_path, taken, idx_str = build_nurse_choices("", "")
    return radio_update, card_md, audio_path, taken, idx_str, msg, ics_path


def tts_read(text):
    """将解析结果朗读为语音，供老人点击播放。"""
    return text_to_speech(text)


def chat_elder_wrapper(message, history):
    """老人端包装函数：查询所有用药信息（不限制床号和姓名）"""
    from config import MEDICINE_DB
    yield from chat_with_rag(message, history, MEDICINE_DB, bed_no="", resident_name="")


def chat_nurse_wrapper(message, history, bed_no, resident_name):
    """护工端包装函数：根据指定患者查询用药信息"""
    bed_no = str(bed_no or "").strip()
    resident_name = str(resident_name or "").strip()
    from config import MEDICINE_DB
    yield from chat_with_rag(
        message,
        history,
        MEDICINE_DB,
        bed_no=bed_no,
        resident_name=resident_name,
    )


def get_last_assistant_message(chatbot_history):
    """
    从chatbot历史记录中提取最后一条助手的回答。

    参数：
    - chatbot_history: Gradio Chatbot 的历史记录（list of dicts with "role" and "content"）

    返回：
    - 最后一条助手消息的文本，如果没有则返回 None
    """
    if not chatbot_history:
        return None

    # 从后往前遍历，找最后一条角色为"assistant"的消息
    for message in reversed(chatbot_history):
        if isinstance(message, dict) and message.get("role") == "assistant":
            content = message.get("content", "")

            # 处理 content 可能是字符串或列表的情况
            if isinstance(content, list):
                # 如果是列表，提取其中的文本部分
                text_parts = []
                for item in content:
                    if isinstance(item, str):
                        text_parts.append(item)
                    elif isinstance(item, dict) and "text" in item:
                        text_parts.append(item.get("text", ""))
                content = "".join(text_parts)

            # 转换为字符串并去除空白
            content = str(content or "").strip()
            if content:
                return content

    return None


def tts_chat_read(chatbot_history):
    """将chatbot最后的回答朗读为语音"""
    text = get_last_assistant_message(chatbot_history)
    if not text:
        return None
    return text_to_speech(text)


def clear_elder_ocr():
    """老人端：在点击 AI 检测前，清空上一条识别结果与语音内容。"""
    return (
        "等待输入...",  # status_out_e
        "",  # summary_out_e
        "",  # name_out_e
        "",  # dosage_out_e
        "",  # contra_out_e
        [],  # time_sel_e
        "",  # custom_time_out_e
        None,  # audio_note_e
        None,  # tts_summary_e
        None,  # tts_name_e
        None,  # tts_dosage_e
        None,  # tts_contra_e
    )


def clear_nurse_ocr():
    """护工端：在点击 AI 检测前，清空上一条识别结果与老人信息、语音内容。"""
    return (
        "等待输入...",  # status_out_n
        "",  # summary_out_n
        "",  # name_out_n
        "",  # dosage_out_n
        "",  # contra_out_n
        [],  # time_sel_n
        "",  # custom_time_out_n
        None,  # audio_note_n
        "",  # bed_in_n
        "",  # resident_in_n
    )

