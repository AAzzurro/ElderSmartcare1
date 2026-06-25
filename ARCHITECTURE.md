## 架构总览

本项目由 **FastAPI 后端** + **React/Tailwind 前端** 组成，用于老人端与护工端的用药辅助、提醒与问诊。

- 后端：`v1original/api.py` + 业务逻辑 `core_logic.py`、AI 相关逻辑 `ai_agents.py`、配置 `config.py`。
- 前端：`v1original/frontend`（Vite + React + Tailwind），入口为 `src/main.jsx` / `src/App.jsx`。
- 数据存储：当前使用内存中的 `MEDICINE_DB`（`config.py`），后端重启后数据清空。

---

## 新旧架构对比

### 旧架构：Gradio 单体应用

- **技术栈**
  - Python + Gradio（Blocks、Tabs、Button、Textbox 等）。
  - 样式通过 `style.css` 和 Gradio 内置 Theme 实现。
- **结构**
  - `main.py`：创建 Gradio Blocks，负责：
    - 调用 `ui_elder.py` / `ui_nurse.py` 构建界面；
    - 绑定事件（上传图片、AI 检测、加入排班、TTS、ASR、问大夫）。
  - `ui_elder.py`：老人端 UI（药品说明书翻译、用药提醒、问大夫）。
  - `ui_nurse.py`：护工端 UI（信息录入、用药管理系统、问大夫）。
- **特点**
  - 前后端高度耦合在 Gradio 中，交互简单但不易做复杂的移动端 UI。
  - 所有界面逻辑写在 Python 内，前端可定制能力有限。
  - 现在这部分（`main.py`、`ui_elder.py`、`ui_nurse.py`、`style.css`）已被删除，仅保留核心业务逻辑。

### 新架构：FastAPI + React/Tailwind 前后端分离

- **后端**
  - 框架：FastAPI。
  - 主要文件：
    - `api.py`：提供 HTTP API。
    - `core_logic.py`：核心业务逻辑（药品入柜、排班、ICS 生成、老人/护工视图）。
    - `ai_agents.py`：OCR、聊天 RAG、语音转文字（ASR）、文字转语音（TTS）。
    - `config.py`：全局配置、内存数据库 `MEDICINE_DB`。
  - 主要接口（均以 `/api/*` 开头）：
    - `POST /api/ocr`：上传图片或文本，调用 `agent_ocr_extract`，返回药品名、用法用量、禁忌、推荐服药时间等。
    - `POST /api/add_medicine`：录入用药记录（老人端/护工端分别传不同字段），调用 `add_to_cabinet` 存入 `MEDICINE_DB`，支持附带语音备注文件。
    - `GET /api/schedules`：获取排班视图，底层调用 `get_styled_db`。
    - `POST /api/chat`：问大夫，调用 `chat_with_rag`，结合当前用药记录做 RAG 问答。
    - `POST /api/tts`：文字转语音，返回可播放的音频 URL。
    - `POST /api/transcribe`：语音转文字（ASR），用于语音问诊。
    - `GET /api/elder_audio_choices` / `GET /api/elder_audio`：老人端语音叮嘱列表与音频。
    - `POST /api/nurse_toggle_taken`：护工端勾选“已服药”状态。
    - `GET /api/audio_by_index`：按索引返回某条语音文件。

- **前端**
  - 框架：Vite + React + Tailwind CSS。
  - 入口文件：
    - `frontend/src/main.jsx`：挂载 React 根组件。
    - `frontend/src/App.jsx`：移动端“壳”和身份切换（入口/老人/护工）。
  - 组件结构：
    - `EntryPage.jsx`：入口页（👴 我是老人 / 👩‍⚕️ 我是护工）。
    - `elder/ElderApp.jsx`：老人端整体：
      - `OcrSection` + `ElderOcrTab`：药品说明书翻译，OCR 结果可编辑，支持语音备注上传。
      - `ElderReminderTab`：老人端用药提醒，仅展示无床号/姓名的数据，包含用药禁忌、语音叮嘱播放、“一键生成系统提醒”按钮。
      - `ElderChatTab`：老人问大夫，支持文本输入、语音输入（ASR）、每条医生回复单独 TTS 播放。
    - `nurse/NurseApp.jsx`：护工端整体：
      - `OcrSection`：与老人端类似，但附加床号、姓名。
      - `NurseIntakeTab`：信息录入，所有字段可编辑，保存后写入 `MEDICINE_DB`。
      - `NurseManageTab`：用药管理系统，仅展示有床号/姓名的数据，支持播放语音叮嘱、勾选“已服药”。
      - `NurseChatTab`：护工端问大夫，支持 ASR + 每条医生回复 TTS。
    - `ui.jsx`：通用 UI 组件（`MobileShell`、`Modal`、`TopBar`、`TabBar`、`Card`、`PrimaryButton`、`TextArea` 等）。
    - `apiClient.js`：所有前端调用后端 API 的封装。

---

## 系统数据流向图（文字描述）

### 1. 药品 OCR 与录入

1. 用户在前端（老人端或护工端）点击“拍照/上传图片”或输入说明书文本。
2. 前端通过 `apiClient.fetchOcr` 调用 `POST /api/ocr`，发送图片和/或文本。
3. 后端 `api.py` 调用 `ai_agents.agent_ocr_extract` 完成 OCR + LLM 提取，得到：
   - 药品名称、用法用量、识别禁忌、推荐服药时间（timeList / custom_time）等。
4. `api.py` 将结构化 JSON 返回前端。
5. 前端将结果自动填入各个可编辑输入框（summary/name/dosage/contra/timeList/customTime），用户可以继续修改。
6. 用户点击“加入用药卡片”或护工“确认录入”，前端通过 `apiClient.fetchAddMedicine` 调用 `POST /api/add_medicine`：
   - 老人端：不传床号、姓名。
   - 护工端：传床号、姓名。
   - 如有语音备注，一并作为文件字段上传。
7. 后端调用 `core_logic.add_to_cabinet` 将记录写入内存数据库 `MEDICINE_DB`。

### 2. 用药提醒 / 用药管理

1. 前端通过 `apiClient.fetchSchedules` 调用 `GET /api/schedules`。
2. 后端 `api.py` 调用 `core_logic.get_styled_db` 把 `MEDICINE_DB` 包装为 DataFrame 样式数据，带 `_index`。
3. 接口返回所有记录列表。
4. 前端按角色筛选：
   - 老人端：筛选无“床号”“姓名”的记录，用于“当前本机老人用药排班”。
   - 护工端：筛选有“床号”或“姓名”的记录，用于“用药管理系统”。
5. 护工端勾选“已服药”：
   - 前端调用 `apiClient.fetchNurseToggleTaken` -> `POST /api/nurse_toggle_taken`。
   - 后端更新 `MEDICINE_DB` 中对应记录的 `已服药` 字段。

### 3. 语音叮嘱与 TTS

1. 老人端/护工端点击某条药品旁的“朗读”按钮：
   - 前端调用 `apiClient.fetchTts` -> `POST /api/tts`，传入要朗读的文本（药品名、用药说明、禁忌、医生回复等）。
   - 后端调用 TTS 引擎（如 gTTS）生成音频文件，并返回可访问的音频 URL。
2. 前端将音频 URL 设置到隐藏 `<audio>` 或可见播放器上并立即 `play()`，实现无感播放。
3. 老人端“语音叮嘱”选择框：
   - 调用 `GET /api/elder_audio_choices` 获取可选药品列表。
   - 选择某药品后，调用 `GET /api/elder_audio` 获取该药品预生成的语音叮嘱音频 URL 并播放。

### 4. 问大夫（聊天 + RAG）

1. 用户在前端输入咨询文本，或上传语音文件让 ASR 转文字：
   - ASR：前端调用 `POST /api/transcribe`，后端用 `transcribe_audio` 转成文字并返回。
2. 前端把最终咨询文本通过 `apiClient.fetchChat` 调用 `POST /api/chat`，附带（如有）床号、姓名。
3. 后端：
   - 使用 `get_user_medicines_context` 在 `MEDICINE_DB` 中检索该老人相关用药记录。
   - 将检索到的用药上下文 + 用户问题传入 `chat_with_rag`（RAG 模型）。
   - 返回医生风格的回答文本。
4. 前端将回答添加到对话气泡列表中，并提供“朗读”按钮，按需调用 `POST /api/tts` 播放回答音频。

---

## 运行步骤

### 1. 准备环境

1. 安装 Python 及虚拟环境（如 `venv`）。
2. 安装后端依赖（示例）：

```bash
pip install fastapi uvicorn[standard] pillow pydantic python-multipart requests gtts
```

3. 前端进入 `v1original/frontend`，安装依赖：

```bash
cd v1original/frontend
npm install
```

### 2. 启动后端（FastAPI）

在 `v1original` 目录下运行：

```bash
cd v1original
python api.py
```

或使用 Uvicorn：

```bash
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

注意：
- 当前所有接口默认监听 `http://127.0.0.1:8000`。
- `MEDICINE_DB` 存在于内存中，**后端重启会清空记录**。

### 3. 启动前端（React + Vite）

在 `v1original/frontend` 下：

```bash
cd v1original/frontend
npm run dev
```

默认开发地址通常是 `http://127.0.0.1:5173`（以本地 Vite 输出为准）。

前端通过 `apiClient.js` 中配置的 `BASE_URL` 调用后端 API（当前为 `http://127.0.0.1:8000`）。

### 4. 打包前端

生产构建：

```bash
cd v1original/frontend
npm run build
```

构建产物默认在 `v1original/frontend/dist` 下，可由任意静态服务器托管（如 Nginx、Vercel 等）。

---

## 后续可拓展方向

- 将 `MEDICINE_DB` 从内存迁移到真正的数据库（SQLite/PostgreSQL），实现持久化。
- 为老人端和护工端引入账号体系与权限控制（例如基于床号/机构编码的多租户）。
- 为 FastAPI 增加 OpenAPI 文档说明与自动生成客户端 SDK。
- 将 TTS/ASR 替换为更高质量或更稳定的服务（如云厂商语音服务），并增加多说话人/方言支持。

