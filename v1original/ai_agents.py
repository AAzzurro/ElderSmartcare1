import os
from zhipuai import ZhipuAI
from config import API_KEY
import json
import time
import httpx  # 依然需要这个网络神器
from utils import prepare_image_for_ocr
from local_ocr import extract_text_from_image

# ==========================================
# 🛑 物理级切断代理：无视电脑上的所有“幽灵”设置
# ==========================================
# 不管 Windows 系统里有没有残留的代理毒素，统统当没看见！强制直连！
clean_client = httpx.Client(trust_env=False)

# 带着干净的网络和正确的 Key 去见大模型
client = ZhipuAI(api_key=API_KEY, http_client=clean_client)
# ==========================================
# 🎤 独立模块：真实的语音转文字
# ==========================================
def transcribe_audio(audio_path):
    """语音转文字，使用智谱 glm-asr-2512。支持 wav/mp3，建议先在后端将 webm 转为 wav。"""
    if not audio_path or not os.path.exists(audio_path):
        raise ValueError("音频文件不存在")
    try:
        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model="glm-asr-2512",
                file=f,
            )
        text = getattr(response, "text", None) or (response if isinstance(response, str) else "")
        return (text or "").strip()
    except Exception as e:
        print(f"❌ 语音识别失败: {repr(e)}")
        raise


# ==========================================
# 🌐 通用模块：智谱云端知识库检索
# ==========================================
def retrieve_from_cloud_kb(query: str, top_k: int = 5):
    """
    调用智谱云端知识库检索相关内容。
    返回形如 [{"text": "...片段内容...", "source": "文档标题或ID"}, ...]。
    """
    from config import CLOUD_KNOWLEDGE_BASE_ID, ENABLE_CLOUD_KNOWLEDGE

    query = (query or "").strip()
    print(
        f"🧪 调用 retrieve_from_cloud_kb: ENABLE_CLOUD_KNOWLEDGE={ENABLE_CLOUD_KNOWLEDGE}, "
        f"CLOUD_KNOWLEDGE_BASE_ID='{CLOUD_KNOWLEDGE_BASE_ID}', query_prefix='{query[:30]}'"
    )
    if not query:
        print("ℹ️ 云端知识库检索被跳过：query 为空")
        return []
    if not ENABLE_CLOUD_KNOWLEDGE:
        print("ℹ️ 云端知识库检索被跳过：ENABLE_CLOUD_KNOWLEDGE 为 False")
        return []
    if not CLOUD_KNOWLEDGE_BASE_ID:
        print("ℹ️ 云端知识库检索被跳过：CLOUD_KNOWLEDGE_BASE_ID 为空（可能 .env 未生效）")
        return []

    try:
        url = "https://open.bigmodel.cn/api/paas/v4/knowledge/retrieve"
        payload = {
            "knowledge_id": CLOUD_KNOWLEDGE_BASE_ID,
            "query": query,
            "top_k": top_k,
            # 根据官方文档选择：vector / keyword / hybrid，这里默认 hybrid
            "retrieve_type": "hybrid",
        }
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        }
        resp = clean_client.post(url, json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        # 兼容不同返回结构：可能是 data.items 或直接 data 列表
        items = (
            data.get("data", {}).get("items")
            if isinstance(data.get("data"), dict)
            else data.get("data")
        )
        if not items:
            return []

        snippets = []
        for item in items:
            if not isinstance(item, dict):
                continue
            text = item.get("content") or item.get("text") or ""
            meta = item.get("metadata") or {}
            source = meta.get("title") or meta.get("source") or ""
            if text and isinstance(text, str):
                snippets.append({"text": text.strip(), "source": source or ""})
        print(f"✅ 云端知识库检索成功：query='{query[:50]}...', 返回片段数={len(snippets)}")
        return snippets
    except Exception as e:
        print(f"❌ 云端知识库检索失败: {repr(e)}")
        return []


# ==========================================
# 🧠 独立模块：图文解析大脑（本地 OCR + LLM 大白话翻译）
# ==========================================
def _normalize_time_list_by_dosage(dosage: str, time_list, custom_time: str):
    """
    在保留原有规则的前提下，让 time_list 尽量与 dosage 中的「一天几次」保持一致。
    如说明书有“每8小时一次 / 间隔8小时”这类严格要求，则不强行干预。
    """
    try:
        txt = str(dosage or "")
        custom_txt = str(custom_time or "")

        if any(k in custom_txt for k in ["每", "间隔"]) and "小时" in custom_txt:
            return time_list

        import re

        n = None
        m = re.search(r"(一[天日]|每[天日])\s*(\d+)\s*次", txt)
        if m:
            try:
                n = int(m.group(2))
            except ValueError:
                n = None

        if n is None and re.search(r"(一[天日]|每[天日]).{0,4}一次", txt):
            n = 1

        if n is None:
            mapping = {"一": 1, "二": 2, "两": 2, "三": 3}
            m2 = re.search(r"(一[天日]|每[天日]).{0,4}([一二两三])次", txt)
            if m2:
                n = mapping.get(m2.group(2))

        if not n or n <= 0:
            return time_list

        if not isinstance(time_list, list):
            time_list = ["早餐后"]

        if len(time_list) == n:
            return time_list

        if len(time_list) > n:
            return time_list[:n]

        base_presets = {
            1: ["睡前"],
            2: ["早餐后", "晚餐后"],
            3: ["早餐后", "午餐后", "晚餐后"],
        }

        if len(time_list) == 0 and n in base_presets:
            return base_presets[n]

        result = list(time_list)
        last = result[-1] if result else "早餐后"
        while len(result) < n:
            result.append(last)
        return result
    except Exception:
        return time_list


_MEDICINE_EXTRACT_SYS_PROMPT = """
你是一位极具同理心的三甲医院医生，专门为老年人服务。
你的任务是阅读说明书文字，提取信息，并把晦涩的医学术语彻底翻译成“老爷爷老奶奶能听懂的大白话”！

【🔴 致命警告：输出格式控制】：
必须、只能输出一个合法的 JSON 对象，不要任何多余字符。

【字段要求】：
- "summary": 用一句通俗易懂的大白话，对药品的核心信息（名称、功效、用法、禁忌）进行整体概括。
- "name": 真实的药名。
- "dosage": 大白话用法！严格照一日吃几次，每次吃几片的格式。若说明书中以范围给出计量则选取中间值；毫克请尽量换算成片数。
- "contra": 带有警告意味的禁忌！
- "time": 根据药理学常识和说明书推断吃药时间，必须输出数组。从以下标签中挑选（不要 Emoji）：
  ["晨起空腹", "早餐前", "早餐中", "早餐后", "午餐前", "午餐中", "午餐后",
   "晚餐前", "晚餐中", "晚餐后", "睡前", "紧急/按需服用"]
  标签数量与 dosage 中一日吃的次数尽量一致。
- "custom_time": 有严格间隔或特殊时间要求时必填，否则为 ""。

范例：
{"summary": "这是降血糖药，每餐后吃半片，一天吃三次，肠胃不好千万别吃", "name": "阿卡波糖片", "dosage": "每次吃半片，一天吃三次", "contra": "肠胃不好的千万别吃！", "time": ["早餐后", "午餐后", "晚餐后"], "custom_time": ""}
"""


def agent_ocr_extract(image, text_input):
    if image is None and not text_input:
        return "❌ 请拍摄药盒，或在文本框中输入/语音听写说明书内容", "", "", "", "", [], ""

    ocr_text = ""
    if image is not None:
        try:
            prepare_image_for_ocr(image)
        except Exception as e:
            print(f"⚠️ 图片预处理失败: {e}")

        print("📷 阶段1：本地 OCR 识别中...")
        t0 = time.time()
        ocr_text = extract_text_from_image(image)
        print(f"📝 OCR 完成，耗时 {time.time() - t0:.1f}s，字符数 {len(ocr_text)}")

        if not ocr_text.strip() and not text_input:
            return (
                "⚠️ 未能从图片中识别出文字，请重新拍照（尽量正对、光线充足）或手动输入",
                "",
                "",
                "",
                "",
                [],
                "",
            )

    parts = []
    if ocr_text.strip():
        parts.append(f"【说明书 OCR 识别内容】\n{ocr_text.strip()}")
    if text_input:
        parts.append(f"【用户补充信息】\n{text_input.strip()}")
    combined_text = "\n\n".join(parts)

    try:
        messages = [
            {"role": "system", "content": _MEDICINE_EXTRACT_SYS_PROMPT},
            {
                "role": "user",
                "content": f"请根据以下药品说明书文字，提取并翻译信息：\n\n{combined_text}",
            },
        ]

        model_choice = "glm-4-flash"
        print(f"🧠 阶段2：LLM 大白话翻译中（{model_choice}）...")
        t1 = time.time()
        response = client.chat.completions.create(
            model=model_choice, messages=messages, temperature=0.1
        )
        print(f"✅ LLM 完成，耗时 {time.time() - t1:.1f}s")

        content = response.choices[0].message.content.strip()

        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        print("\n" + "=" * 40)
        print(f"🚀 调用模型: {model_choice}")
        print(f"🤖 大模型真实返回的字符串:\n{content}")
        print("=" * 40 + "\n")

        data = json.loads(content)

        time_list = data.get("time", ["早餐后"])
        if not isinstance(time_list, list):
            time_list = ["早餐后"]
        custom_time_str = (data.get("custom_time") or "").strip()

        dosage_str = data.get("dosage", "")
        time_list = _normalize_time_list_by_dosage(dosage_str, time_list, custom_time_str)

        return (
            "✅ 提取成功！请在下方核对：",
            data.get("summary", ""),
            data.get("name", "未提取到"),
            dosage_str or "未提取到",
            data.get("contra", "无"),
            time_list,
            custom_time_str,
        )

    except Exception as e:
        print(f"❌ 解析报错了: {str(e)}")
        return "⚠️ 提取失败，请看终端日志", "", "", "", "", [], ""

# ==========================================
# 💬 独立模块：RAG 医疗问诊大脑（适配 Chatbot messages 格式）
# ==========================================
def get_user_medicines_context(med_db, bed_no: str = "", resident_name: str = ""):
    """
    根据用户身份（床号+姓名）检索用药信息。
    - med_db: 当前 care_group 下的用药列表（必传）
    - 老人端：bed_no 与 resident_name 都为空时返回该组内全部用药。
    - 护工端：按床号/姓名过滤。
    """
    if not med_db or not isinstance(med_db, list):
        return ""

    medicines_info = []
    for medicine in med_db:
        if not bed_no and not resident_name:
            medicines_info.append(medicine)
        else:
            match_bed = (not bed_no) or (str(medicine.get("床号", "")) == bed_no)
            match_name = (not resident_name) or (str(medicine.get("姓名", "")) == resident_name)
            if match_bed and match_name:
                medicines_info.append(medicine)

    if not medicines_info:
        return ""

    # 格式化用药信息
    context = "【用户用药信息检索结果】\n"
    context += "本系统已检索到以下用药记录：\n"
    for idx, med in enumerate(medicines_info, 1):
        context += f"{idx}. 药品：{med.get('药品名称', '未知')} | "
        context += f"用法：{med.get('用法用量', '未知')} | "
        context += f"禁忌：{med.get('识别禁忌', '无')} | "
        context += f"时间：{med.get('服药时间', '未知')}\n"

    return context

def chat_with_rag(message, history, med_db, bed_no: str = "", resident_name: str = ""):
    """
    根据用户提问 + 当前 care_group 的用药档案 + 云端知识库，发起 RAG 对话。
    参数：
    - message: 用户咨询
    - history: 聊天历史
    - med_db: 当前 care_group 的用药列表（必传）
    - bed_no / resident_name: 护工端筛选老人
    RAG 来源：① 本地用药档案（med_db 中该老人/全部） ② 云端知识库（智谱）。
    """
    if history is None:
        history = []

    print(
        f"chat_with_rag called: message_prefix='{(message or '')[:30]}', "
        f"bed_no='{bed_no}', resident_name='{resident_name}', med_db_len={len(med_db) if med_db else 0}"
    )

    rag_context = ""
    medicines_found_summary = ""

    # 1. 本地用药档案：当前 care_group 下该老人的用药
    user_medicines_context = get_user_medicines_context(med_db, bed_no, resident_name)
    if user_medicines_context:
        rag_context += user_medicines_context + "\n"
        count = 0
        for medicine in (med_db or []):
            if not bed_no and not resident_name:
                count += 1
            else:
                match_bed = (not bed_no) or (str(medicine.get("床号", "")) == bed_no)
                match_name = (not resident_name) or (str(medicine.get("姓名", "")) == resident_name)
                if match_bed and match_name:
                    count += 1
        medicines_found_summary = f"已检索 {count} 条用药记录"
    else:
        medicines_found_summary = "未检索到用药记录"

    # 2. 云端药典 / 专业知识库（智谱知识库检索）
    cloud_query_parts = [message]
    if user_medicines_context:
        cloud_query_parts.append(user_medicines_context)
    cloud_query = "\n\n".join(part for part in cloud_query_parts if part.strip())

    cloud_snippets = retrieve_from_cloud_kb(cloud_query, top_k=5)
    if cloud_snippets:
        rag_context += "【云端药典 / 专业资料检索结果】\n"
        for i, snippet in enumerate(cloud_snippets, 1):
            source = snippet.get("source") or ""
            text = snippet.get("text") or ""
            if not text:
                continue
            if source:
                rag_context += f"{i}. 来源：{source}\n{text}\n\n"
            else:
                rag_context += f"{i}. {text}\n\n"

    # 构造系统提示词
    sys_prompt = """你是负责任的社区全科医生。请用通俗易懂的语言回答老年患者的用药咨询。
【规则】：
1. 你已检索患者当前用药档案与云端专业资料。回答必须基于检索内容，严禁编造药名、剂量或结论。
2. 若检索资料不足以得出结论，请明确说明“现有资料未找到确切结论”，并建议线下就医或咨询药师。
3. 回复请适当精简：优先给出结论 + 关键理由 + 可执行建议；避免长篇解释。
4. 不要使用任何 Emoji 或表情符号。
5. 当存在相互作用、禁忌、肝肾功能/胃出血/妊娠等高风险线索时，必须明确提示风险与就医建议。"""
    
    if rag_context:
        sys_prompt += (
            "\n\n【极其重要】：你必须根据以下检索到的真实信息提出警告，绝对不能胡编乱造：\n"
            f"{rag_context}"
        )

    # 构造发给大模型的 messages（只用当前轮次 + 系统提示，避免历史格式差异）
    llm_messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": message},
    ]

    # 在 Chatbot 的 history 中追加当前用户与空的助手回复
    new_history = list(history)
    new_history.append({"role": "user", "content": message})
    # 初始化助手回复，包含检索摘要
    new_history.append({"role": "assistant", "content": f"{medicines_found_summary}\n\n"})

    try:
        response = client.chat.completions.create(
            model="glm-4-flash", messages=llm_messages, stream=True
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                new_history[-1]["content"] += delta
                yield "", new_history
    except Exception as e:
        new_history[-1]["content"] = f"{medicines_found_summary}\n\n请求失败：{str(e)}"
        yield "", new_history


# ==========================================
# 🔍 独立模块：药物相互作用检查Agent
# ==========================================
def check_drug_interactions(new_drug_name, new_drug_dosage, new_drug_contra, med_db, bed_no: str = "", resident_name: str = ""):
    """
    检查新药与当前 care_group 内已有用药的相互作用。
    - med_db: 当前组的用药列表（由 api 传入）；不传则用 config.MEDICINE_DB。
    """
    from config import DRUG_INTERACTION_KNOWLEDGE_BASE

    source = med_db or []
    scoped_meds = []
    bed_no = str(bed_no or "").strip()
    resident_name = str(resident_name or "").strip()
    for med in (source or []):
        bed = str(med.get("床号", "")).strip()
        name = str(med.get("姓名", "")).strip()
        if bed == bed_no and name == resident_name:
            scoped_meds.append(med)

    interactions = []

    # 1. 从知识库中检查已知的相互作用
    for kb_drug_name, interactions_dict in DRUG_INTERACTION_KNOWLEDGE_BASE.items():
        # 模糊匹配：检查新药名或数据库中的药名是否包含知识库中的配置
        if kb_drug_name.lower() in new_drug_name.lower():
            # 遍历这个药物的所有相互作用
            for interacted_drug, risk_description in interactions_dict.items():
                # 在数据库中查找是否存在这个相互作用的药物
                for existing_med in scoped_meds:
                    existing_drug_name = existing_med.get("药品名称", "")
                    if interacted_drug.lower() in existing_drug_name.lower():
                        # 判断风险等级
                        if "严重" in risk_description or "❌" in risk_description:
                            risk_level = "严重"
                        elif "中度" in risk_description or "⚠️" in risk_description:
                            risk_level = "中度"
                        else:
                            risk_level = "轻度"
                        
                        interactions.append({
                            "existing_drug": existing_drug_name,
                            "risk_level": risk_level,
                            "description": risk_description
                        })
    
    # 反向检查：数据库中的药物是否也在知识库中有与新药的相互作用
    for existing_med in scoped_meds:
        existing_drug_name = existing_med.get("药品名称", "")
        
        for kb_drug_name, interactions_dict in DRUG_INTERACTION_KNOWLEDGE_BASE.items():
            if kb_drug_name.lower() in existing_drug_name.lower():
                for interacted_drug, risk_description in interactions_dict.items():
                    if interacted_drug.lower() in new_drug_name.lower():
                        # 判断风险等级
                        if "严重" in risk_description or "❌" in risk_description:
                            risk_level = "严重"
                        elif "中度" in risk_description or "⚠️" in risk_description:
                            risk_level = "中度"
                        else:
                            risk_level = "轻度"
                        
                        # 检查是否已经添加过这个相互作用（避免重复）
                        is_duplicate = False
                        for interaction in interactions:
                            if (interaction["existing_drug"] == existing_drug_name and 
                                interaction["description"] == risk_description):
                                is_duplicate = True
                                break
                        
                        if not is_duplicate:
                            interactions.append({
                                "existing_drug": existing_drug_name,
                                "risk_level": risk_level,
                                "description": risk_description
                            })
    
    # 2. 使用AI大模型进行补充分析
    ai_warning = ""
    has_interactions = len(interactions) > 0

    # 2.1 本地规则库已经发现相互作用：直接基于本地结果生成解释，不再访问云端知识库
    if has_interactions:
        interaction_summary = "已知相互作用：\n"
        for idx, interaction in enumerate(interactions, 1):
            interaction_summary += f"{idx}. {interaction['existing_drug']}：{interaction['description']}\n"

        try:
            sys_prompt = """你是一位经验丰富的临床药师。用户要添加一种新药物到他们的用药清单中，
但系统已检测到与数据库中已有的药物可能存在相互作用。请你：
1. 确认系统提示的相互作用确实存在
2. 说明这些相互作用的具体危害
3. 给出专业医学建议（如需就医、何时就医等）
请用简洁、易懂的语言，特别考虑老年患者的理解能力。"""

            user_content = f"""用户要添加的新药物：
药名：{new_drug_name}
用法用量：{new_drug_dosage}
禁忌：{new_drug_contra}

系统检测到的相互作用：
{interaction_summary}

请对这些相互作用进行专业分析和建议。"""

            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_content},
            ]

            response = client.chat.completions.create(
                model="glm-4-flash", messages=messages, temperature=0.3
            )
            ai_warning = response.choices[0].message.content.strip()

        except Exception as e:
            print(f"❌ AI相互作用分析失败: {str(e)}")
            ai_warning = "⚠️ 系统已检测到可能的相互作用，请立即咨询医生！"

        return {
            "has_interactions": True,
            "interactions": interactions,
            "ai_warning": ai_warning,
        }

    # 2.2 本地规则库未发现相互作用：调用云端知识库 + 大模型进行二次检查
    cloud_result = analyze_interactions_with_cloud_kb(
        new_drug_name, new_drug_dosage, new_drug_contra, scoped_meds
    )

    if cloud_result is not None:
        return {
            "has_interactions": cloud_result["has_interactions"],
            "interactions": interactions,
            "ai_warning": cloud_result["ai_warning"],
        }

    # 2.3 云端调用失败或未发现明显风险
    return {
        "has_interactions": False,
        "interactions": interactions,
        "ai_warning": "",
    }


def analyze_interactions_with_cloud_kb(
    new_drug_name, new_drug_dosage, new_drug_contra, scoped_meds
):
    """
    当本地规则库没有发现相互作用时，调用云端知识库 + 大模型，
    根据药典 / 专业资料判断是否存在相互作用或明显的功效重复。
    返回:
      {"has_interactions": bool, "ai_warning": str} 或 None（调用失败 / 无结论）
    """
    if not scoped_meds:
        return None

    # 1. 整理当前用药列表为文本
    current_meds_text = ""
    for idx, med in enumerate(scoped_meds, 1):
        current_meds_text += (
            f"{idx}. 药品：{med.get('药品名称', '未知')}；"
            f"用法：{med.get('用法用量', '未知')}；"
            f"禁忌：{med.get('识别禁忌', '无')}\n"
        )

    # 2. 用“新药 + 现有用药”作为 query 去云端知识库检索
    query = (
        f"新药：{new_drug_name}；用法：{new_drug_dosage}；禁忌：{new_drug_contra}。\n"
        f"当前用药列表：\n{current_meds_text}"
    )
    snippets = retrieve_from_cloud_kb(query, top_k=5)
    if not snippets:
        return None

    kb_context = "【来自药典 / 专业资料的检索片段】\n"
    for i, s in enumerate(snippets, 1):
        text = s.get("text") or ""
        if not text:
            continue
        source = s.get("source") or ""
        if source:
            kb_context += f"{i}. 来源：{source}\n{text}\n\n"
        else:
            kb_context += f"{i}. {text}\n\n"

    print(
        f"✅ 云端相互作用分析：使用 {len(snippets)} 条知识库片段，新药='{new_drug_name}', 现有用药数={len(scoped_meds)}"
    )

    # 3. 调用大模型，在仅依据这些资料的前提下给出结构化判断
    sys_prompt = """你是一位严谨的临床药师，只能根据下面『检索结果』中的内容做判断，禁止编造资料来源或药理结论。
请你根据这些资料，判断：
1）新药与当前用药之间是否存在明显药物相互作用；
2）是否存在主要功效高度重复，可能导致重复用药或过量风险。
请务必只输出一个 JSON，对应字段为：
{
  "has_interactions": true/false,
  "has_duplicate_indications": true/false,
  "risk_level": "严重/中度/轻度/不确定",
  "ai_warning": "面向老年患者的大白话提醒，控制在 80 字以内"
}
不要输出任何其他内容。"""

    user_content = f"""新药信息：
- 药名：{new_drug_name}
- 用法用量：{new_drug_dosage}
- 识别禁忌：{new_drug_contra}

当前用药列表：
{current_meds_text}

{kb_context}
"""

    try:
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content},
        ]
        response = client.chat.completions.create(
            model="glm-4-plus", messages=messages, temperature=0.1
        )
        content = response.choices[0].message.content.strip()

        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        data = json.loads(content)
        has_interactions = bool(data.get("has_interactions"))
        has_duplicate = bool(data.get("has_duplicate_indications"))
        ai_warning = (data.get("ai_warning") or "").strip()

        has_risk = has_interactions or has_duplicate
        return {
            "has_interactions": has_risk,
            "ai_warning": ai_warning,
        }
    except Exception as e:
        print(f"❌ 云端相互作用分析失败: {repr(e)}")
        return None