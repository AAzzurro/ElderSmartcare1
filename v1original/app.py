import uvicorn
import os

if __name__ == "__main__":
    # 魔搭空间默认暴露的端口是 7860
    port = int(os.environ.get("PORT", 7860))
    print(f"🚀 智爱助老 V2.0 正在启动，监听端口: {port}")
    
    # 启动 api.py 里面的 app 实例
    uvicorn.run("api:app", host="0.0.0.0", port=port)
