购买后部署流程（简版）
1. 安全组 / 防火墙
在阿里云控制台放行：
22（SSH）
80、443（推荐，走 Nginx）
或临时放行 8000（直连 uvicorn 测试用）

2. SSH 登录并装环境
ssh root@你的公网IP
sudo apt update
sudo apt install -y python3 python3-venv python3-pip ffmpeg nginx git
3. 上传代码
cd /opt
git clone 你的仓库地址
cd ElderSmartcare1/v1original
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install "huggingface_hub>=0.19.3,<0.26"
4. 配置密钥
cp .env.example .env
nano .env
填入 MY_API_KEY 等。

5. 启动后端
source .venv/bin/activate
uvicorn api:app --host 127.0.0.1 --port 8000
浏览器访问 http://你的公网IP:8000/docs 验证。

6. 用 Nginx 做反向代理（推荐）
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_read_timeout 120s;
        proxy_set_header Host $host;
    }
}
有域名可再加 HTTPS（Let's Encrypt）。

7. 更新 APK
改 frontend/.env：

VITE_API_BASE=http://你的公网IP
# 有域名和 HTTPS 更好：
# VITE_API_BASE=https://api.你的域名.com
然后：

npm run build
npx cap sync android
重新在 Android Studio 打 APK。

两个容易踩的坑
1. HTTP 明文访问
若只用 http://IP 没有 HTTPS，Android 可能拦截请求。需在 AndroidManifest.xml 的 <application> 加：

android:usesCleartextTraffic="true"
2. 每次改服务器地址都要重打 APK
VITE_API_BASE 是在 npm run build 时写进 JS 的，不是运行时读取。
