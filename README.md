# 智爱助老 · 智慧养老用药助手 V2

基于 **FastAPI + React/Vite + Tailwind + Capacitor** 的智慧养老用药助手。项目面向老人、护工与家属，提供药品说明识别、用药排班、语音叮嘱、服药状态管理、AI 问诊和移动端封装能力。

> 当前版本主体代码位于 `v1original/`。后端提供 REST API，前端是移动优先的 React 应用，并包含 Capacitor Android 工程，可作为网页运行，也可同步到 Android 工程继续打包。

---

## 功能概览

### 老人端

- 拍照或上传药品说明书，调用 AI/OCR 提取药品名称、用法用量、禁忌和建议服药时间。
- 确认后生成本机老人用药卡片和排班。
- 支持语音备注、语音叮嘱、TTS 朗读和 ASR 语音输入。
- “问大夫”基于当前用药记录进行 RAG 问答，辅助老人理解用药风险。
- 支持生成 `.ics` 日历提醒，便于导入系统日历。

### 护工/家属端

- 录入床号、姓名和药品信息，适合护理站或家庭照护场景。
- 查看不同老人/患者的用药状态和服药时间线。
- 勾选已服药、查看药盒图片、播放语音叮嘱。
- 基于指定老人/患者的用药记录进行 AI 咨询。
- 支持健康事件记录，方便追踪异常、提醒和照护沟通。

---

## 项目结构

```text
.
├── package.json                 # 根目录 Capacitor CLI 依赖
├── package-lock.json
├── ARCHITECTURE.md              # 架构说明
├── README.md
└── v1original/
    ├── app.py                   # 部署入口，默认监听 PORT 或 7860
    ├── api.py                   # FastAPI 后端入口
    ├── ai_agents.py             # OCR、RAG、ASR、TTS、药物相互作用等 AI 能力
    ├── core_logic.py            # 用药排班、记录管理、日历提醒等业务逻辑
    ├── config.py                # 环境变量和内存数据配置
    ├── requirements.txt         # Python 依赖
    ├── .env.example             # 后端环境变量模板
    └── frontend/
        ├── package.json         # React/Vite/Capacitor 前端依赖
        ├── capacitor.config.json
        ├── .env.example         # 前端 API 地址模板
        ├── android/             # Capacitor Android 工程
        └── src/
            ├── App.jsx
            ├── EntryPage.jsx
            ├── apiClient.js
            ├── elder/
            └── nurse/
```

---

## 安全配置

真实 `.env` 文件不会上传到仓库。请复制模板后在本地填写：

```bash
cd v1original
copy .env.example .env
```

后端环境变量：

```text
MY_API_KEY=your_zhipuai_api_key_here
ZHIPU_KNOWLEDGE_BASE_ID=your_knowledge_base_id_here
ENABLE_CLOUD_KNOWLEDGE=1
```

前端环境变量：

```bash
cd v1original/frontend
copy .env.example .env
```

```text
VITE_API_BASE=http://127.0.0.1:8000
```

如果部署到公网，请把 `VITE_API_BASE` 改成你的后端服务地址，例如 `https://your-api.example.com`。

---

## 环境要求

- Python 3.10+
- Node.js 18+
- FFmpeg

音频识别和转码依赖 FFmpeg。请不要把 `ffmpeg.exe`、`ffprobe.exe` 放进 Git 仓库，建议在系统中安装并加入 `PATH`。

Windows 可下载 FFmpeg 并把 `bin` 目录加入环境变量；macOS 可运行 `brew install ffmpeg`；Linux 可运行 `sudo apt install ffmpeg`。

---

## 本地运行

### 1. 安装后端依赖

```bash
cd v1original
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install python-multipart
```

### 2. 启动后端

```bash
cd v1original
uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

也可以运行：

```bash
python app.py
```

`app.py` 默认读取 `PORT` 环境变量，没有配置时监听 `7860`。

### 3. 安装并启动前端

```bash
cd v1original/frontend
npm install
npm run dev
```

按终端提示访问，一般是 `http://127.0.0.1:5173`。

### 4. 构建前端

```bash
cd v1original/frontend
npm run build
```

构建产物位于 `v1original/frontend/dist/`。

---

## Android / Capacitor

前端已包含 Capacitor 配置和 Android 工程。更新网页代码后可同步到 Android：

```bash
cd v1original/frontend
npm install
npm run build
npx cap sync android
npx cap open android
```

随后可在 Android Studio 中继续构建 APK。移动端访问后端时，请确保 `VITE_API_BASE` 指向手机或模拟器能访问到的后端地址。

---

## 数据说明

当前版本使用内存数据结构保存用药记录，后端重启后数据会清空。运行时生成的语音备注、药盒图片和临时文件不应提交到仓库，已通过 `.gitignore` 排除。

如果需要长期使用，建议后续接入 SQLite、PostgreSQL 或云数据库，并为老人、家属和护工建立正式账号体系。

---

## 备注

- AI 能力依赖智谱 API Key，请勿把真实密钥写入代码或提交到 GitHub。
- 前端 API 地址通过 `VITE_API_BASE` 配置，不再硬编码临时内网穿透地址。
- 详细接口、模块和数据流可继续阅读 `ARCHITECTURE.md`。

pip install -r requirements.txt
pip install python-multipart

cd /Users/azzuro/ElderSmartcare1/v1original/frontend
npm install
npm run build
npx cap sync android

第三步：用 Android Studio 打 APK
安装 Android Studio
打开工程目录：v1original/frontend/android
等待 Gradle 同步完成
菜单：Build → Build Bundle(s) / APK(s) → Build APK(s)
完成后 APK 在：

v1original/frontend/android/app/build/outputs/apk/debug/app-debug.apk

cd /Users/azzuro/ElderSmartcare1/v1original
source .venv/bin/activate
uvicorn api:app --host 0.0.0.0 --port 8000