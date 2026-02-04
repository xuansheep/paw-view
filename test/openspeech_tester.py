import asyncio
import aiohttp
import wave
import json
import sys

# ================= 配置区域 =================
# 你的服务器地址
SERVER_URL = "ws://127.0.0.1:8080/ws/asr"
# 测试音频文件 (必须是 16k 采样率, 单声道)
TEST_FILE = "test_16k.wav"
# 模拟发送间隔 (秒)
INTERVAL = 0.2


# ===========================================

async def run_mock_client():
    print(f"-" * 50)
    print(f"连接服务器: {SERVER_URL}")
    print(f"读取文件: {TEST_FILE}")
    print(f"-" * 50)

    async with aiohttp.ClientSession() as session:
        try:
            async with session.ws_connect(SERVER_URL) as ws:
                print("连接成功! 开始模拟实时语音流...\n")

                # 打开音频文件
                try:
                    wf = wave.open(TEST_FILE, 'rb')
                except FileNotFoundError:
                    print(f"错误: 找不到文件 '{TEST_FILE}'")
                    return

                if wf.getframerate() != 16000 or wf.getnchannels() != 1:
                    print("警告: 音频必须是 16000Hz 单声道，否则识别结果可能乱码。")

                # 计算 chunk size
                chunk_size = int(16000 * 2 * INTERVAL)

                # 使用 Event 来协调结束
                stop_event = asyncio.Event()

                async def sender():
                    """只负责发，不再抢占屏幕打印进度"""
                    total_sent = 0
                    while True:
                        data = wf.readframes(chunk_size // 2)
                        if not data:
                            break

                        await ws.send_bytes(data)
                        total_sent += len(data)

                        # 模拟真实语速等待
                        await asyncio.sleep(INTERVAL)

                    print("\n[Sender] 音频发送完毕，发送 STOP 指令...")
                    await ws.send_str("STOP")
                    stop_event.set()

                async def receiver():
                    """独占屏幕，实时打印结果"""
                    print("实时转写结果:")
                    try:
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                data = json.loads(msg.data)
                                text = data.get("text", "")
                                is_final = data.get("is_final", False)

                                # 核心逻辑：只在有字的时候刷新
                                if text:
                                    # \r 回到行首，清除这一行之前的内容，然后打印新字
                                    # end='' 确保不换行，实现字幕滚动效果
                                    sys.stdout.write(f"\r正在识别: {text}")
                                    sys.stdout.flush()

                                if is_final:
                                    # 如果是最终结果，换行保存下来，不再被覆盖
                                    sys.stdout.write(f"\r最终结果: {text}\n")
                                    sys.stdout.flush()

                            elif msg.type == aiohttp.WSMsgType.CLOSED:
                                print("\n[Receiver] 服务器断开连接")
                                break
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                print(f"\n[Receiver] 发生错误: {ws.exception()}")
                                break
                    except Exception as e:
                        print(f"\n[Receiver] 异常: {e}")

                # 并发运行，直到发送完毕且接收完毕
                # 这里我们让 sender 跑完，receiver 会因为服务器关闭连接而自动结束
                task_sender = asyncio.create_task(sender())
                task_receiver = asyncio.create_task(receiver())

                await task_sender
                # 等待接收端处理完最后的包
                await task_receiver

        except aiohttp.ClientConnectorError:
            print(f"连接失败。请检查服务器 {SERVER_URL} 是否已启动。")
        except Exception as e:
            print(f"发生未知错误: {e}")


if __name__ == "__main__":
    # Windows 需要设置策略
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    try:
        asyncio.run(run_mock_client())
    except KeyboardInterrupt:
        print("\n用户手动停止。")
