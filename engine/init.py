# -*- coding: utf-8 -*-
"""
DesRedTeam 便携版 一键初始化 + 启动脚本 (Python 版)
====================================================
用法:
  python init.py             一键: 自检 -> 建目录 -> 提示配 key -> 启动 -> 验证
  python init.py --check     只做环境自检 (文件/工具链/端口/profile)
  python init.py --start     启动平台 (desredteam.exe --http)
  python init.py --stop      停止平台
  python init.py --restart   重启
  python init.py --fix-config  修复 config.yaml 里的旧机绝对路径 (改前自动备份)
  python init.py --with-data 查看「带数据迁移」说明

零依赖 (标准库), 复用同目录 setup_env.py 的自检/密钥函数。
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

# 复用 setup_env.py (同目录) 的函数
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import setup_env as se

EXE_NAMES = ["desredteam.exe", "cyberstrike-ai.exe"]   # 新名优先, 兼容旧名
BASE_URL = "http://127.0.0.1:8080/"

# ---------------------------------------------------------------
# 一、基础工具
# ---------------------------------------------------------------
def find_exe():
    """找平台主程序, 返回绝对路径或 None"""
    for name in EXE_NAMES:
        p = os.path.join(SCRIPT_DIR, name)
        if os.path.isfile(p):
            return p
    return None

def ensure_dirs():
    """确保运行时目录存在"""
    for d in ("data", "chat_uploads", "logs", "tmp"):
        p = os.path.join(SCRIPT_DIR, d)
        if not os.path.isdir(p):
            os.makedirs(p, exist_ok=True)
            print(f"  [建目录] {d}")

def ensure_config():
    """config.yaml 缺失时从 example 复制"""
    cfg = os.path.join(SCRIPT_DIR, "config.yaml")
    if not os.path.isfile(cfg):
        example = os.path.join(SCRIPT_DIR, "config.example.yaml")
        if os.path.isfile(example):
            shutil.copy2(example, cfg)
            print("  [配置] 已从 config.example.yaml 生成 config.yaml (请配置密钥)")
        else:
            print("  [警告] config.yaml 与 config.example.yaml 都不存在!")

# ---------------------------------------------------------------
# 二、服务管理 (启动/停止)
# ---------------------------------------------------------------
def start():
    exe = find_exe()
    if not exe:
        print("  [失败] 未找到 " + " / ".join(EXE_NAMES) + ", 请先编译或检查解压完整性")
        return False
    # 端口已被占用 -> 可能已在运行
    if se.test_port(8080):
        print("  [提示] 8080 端口已有服务, 跳过启动 (如需重启先 --stop)")
        return True
    print(f"  [启动] {os.path.basename(exe)} --http  (cwd={SCRIPT_DIR})")
    # 脱离控制台启动, 输出丢弃 (zap 日志直接写文件)
    DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen([exe, "--http"], cwd=SCRIPT_DIR,
                     creationflags=DETACHED,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 轮询验证 (最多 30 秒)
    for i in range(30):
        time.sleep(1)
        try:
            with urllib.request.urlopen(BASE_URL, timeout=2) as r:
                if r.status == 200:
                    print(f"  [OK] {BASE_URL} -> HTTP 200 ({(i+1)}s)")
                    return True
        except Exception:
            pass
    print("  [警告] 30 秒内未等到 HTTP 200, 请查看日志")
    return False

def stop():
    exe = find_exe()
    if not exe:
        print("  [失败] 未找到主程序")
        return
    name = os.path.basename(exe)
    r = subprocess.run(["taskkill", "/F", "/IM", name],
                       capture_output=True, text=True)
    print(f"  [停止] taskkill /F /IM {name}: " + (r.stdout or r.stderr).strip())


# ---------------------------------------------------------------
# 三-b、外部 MCP 可用性检测 (学员部署新机时用)
# ---------------------------------------------------------------
def parse_servers(raw):
    """解析 config.yaml external_mcp.servers 内联映射, 返回 [(name, seg, raw_enable)]"""
    m = re.search(r"servers:\s*(\{.*\})", raw, re.S)
    if not m:
        return []
    block = m.group(1)
    out = []
    pos = 0
    while True:
        mm = re.search(r"([A-Za-z0-9_-]+):\s*\{", block[pos:])
        if not mm:
            break
        name = mm.group(1)
        start = pos + mm.end() - 1  # '{' 在 block 中的绝对位置
        depth, j = 0, start
        while j < len(block):
            if block[j] == '{':
                depth += 1
            elif block[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        seg = block[start + 1:j]
        en = re.search(r"external_mcp_enable:\s*(\w+)", seg)
        out.append((name, seg, (en.group(1) if en else "true")))
        pos = j + 1  # 跳过该 seg, 避免把 seg 内部的 headers: {...} 误当 server
    return out

def check_server(name, seg):
    """检测单个 server 可用性, 返回 (ok, 原因)"""
    if "type: http" in seg or "url:" in seg:
        u = re.search(r"url:\s*'([^']*)'", seg)
        if not u:
            return False, "HTTP server 无 url"
        try:
            urllib.request.urlopen(u.group(1), timeout=4)
            return True, "HTTP 可达"
        except urllib.error.HTTPError as e:
            # 4xx/5xx = 服务在监听并响应 (MCP streamable http 对 GET 常回 405/400), 算可达
            return True, f"HTTP 可达 (响应 {e.code}, 协议拒绝属正常)"
        except Exception as e:
            return False, f"HTTP 不可达 ({type(e).__name__})"
    # stdio server
    cm = re.search(r"command:\s*'([^']*)'|command:\s*\"([^\"]*)\"|command:\s*([A-Za-z0-9_.-]+)", seg)
    cmd = next((g for g in cm.groups() if g), "") if cm else ""
    if not cmd:
        return False, "无 command"
    if not shutil.which(cmd):
        return False, f"命令不在 PATH: {cmd}"
    # args 里的绝对脚本路径
    am = re.search(r"args:\s*\[([^\]]*)\]", seg)
    if am:
        for a in re.findall(r"'([^']*)'", am.group(1)):
            if os.path.isabs(a) and os.path.splitext(a)[1] in (".py", ".js", ".mjs", ".cjs"):
                if not os.path.isfile(a):
                    return False, f"脚本不存在: {a}"
    return True, "OK"

def setup_mcp(disable_broken=False):
    cfg = os.path.join(SCRIPT_DIR, "config.yaml")
    if not os.path.isfile(cfg):
        print("  [跳过] config.yaml 不存在")
        return
    with open(cfg, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    servers = parse_servers(raw)
    if not servers:
        print("  [提示] config.yaml 中未配置外部 MCP (external_mcp.servers)")
        return
    print()
    print("========== 外部 MCP 可用性检测 ==========")
    broken = []
    for name, seg, en in servers:
        ok, why = check_server(name, seg)
        mark = "[OK]" if ok else ("[!!]" if en == "true" else "[--]")
        color = "ok" if ok else ("broken-enabled" if en == "true" else "disabled")
        print(f"  {mark} {name:<20} enable={en:<5} {why}")
        if not ok and en == "true":
            broken.append((name, seg))
    print("----------------------------------------")
    if not broken:
        print("  全部 MCP 可用或已禁用, 无需处理")
        print("========================================")
        return
    print(f"  {len(broken)} 个已启用但不可用的 MCP (目标机缺依赖/路径失效)")
    if disable_broken:
        for name, seg in broken:
            raw = raw.replace(seg, seg.replace("external_mcp_enable: true",
                                               "external_mcp_enable: false", 1), 1)
        bak = cfg + ".mcp.bak-" + time.strftime("%Y%m%d_%H%M%S")
        shutil.copy2(cfg, bak)
        with open(cfg, "w", encoding="utf-8", newline="\n") as f:
            f.write(raw)
        print(f"  [已禁用] 上述 MCP 已置 external_mcp_enable: false (备份: {os.path.basename(bak)})")
        print("  恢复: 改回 true 并安装对应依赖 (见 MIGRATE.md「MCP 与 Skills 安装」)")
    else:
        print("  修复方式: 安装依赖后改回 true, 或加 --disable-broken 自动禁用")
    print("========================================")
    print()
# ---------------------------------------------------------------
# 三、--fix-config: 修复旧机绝对路径
# ---------------------------------------------------------------
def fix_config():
    cfg = os.path.join(SCRIPT_DIR, "config.yaml")
    if not os.path.isfile(cfg):
        print("  [跳过] config.yaml 不存在")
        return
    with open(cfg, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()

    old_roots = re.findall(r"[A-Za-z]:[\\/]?(?:app|Users)[\\/][^'\"]*", raw)
    problems = []
    for m in re.finditer(r"([A-Za-z]:[\\/][^'\"]{2,})", raw):
        v = m.group(1)
        # 只标记旧机特征路径
        if re.search(r"D:[\\/]app|C:[\\/]Users[\\/]Administrator", v, re.I):
            problems.append(v)

    if not problems:
        print("  [OK] 未发现旧机绝对路径 (D:/app 或 C:/Users/Administrator)")
        return

    print("  发现旧机绝对路径 " + str(len(problems)) + " 处:")
    for p in sorted(set(problems)):
        print("    - " + p)

    # 安全替换: 仅 log.output 这类日志路径换成包内 logs/
    new = re.sub(r"log:\s*\n\s*output:\s*[^\n]*",
                 "log:\n  output: " + os.path.join(SCRIPT_DIR, "logs", "desredteam.log").replace("\\", "/"),
                 raw, count=1)
    # 其余旧路径: 问用户是否清空成注释 (external_mcp 的绝对路径脚本不能自动换)
    if new != raw:
        bak = cfg + ".fix-config.bak-" + time.strftime("%Y%m%d_%H%M%S")
        shutil.copy2(cfg, bak)
        print(f"  [备份] {bak}")
        with open(cfg, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
        print("  [已修] log.output 已指向包内 logs/desredteam.log")
        print("  [提示] external_mcp 的 workflow-pipeline 指向旧机脚本, 请在新机重新配置或删除该 server")

# ---------------------------------------------------------------
# 四、主流程
# ---------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="DesRedTeam 便携版初始化/启动")
    parser.add_argument("--check",      action="store_true", help="环境自检")
    parser.add_argument("--start",      action="store_true", help="启动平台")
    parser.add_argument("--stop",       action="store_true", help="停止平台")
    parser.add_argument("--restart",    action="store_true", help="重启平台")
    parser.add_argument("--fix-config", action="store_true", help="修复 config.yaml 旧机绝对路径")
    parser.add_argument("--setup-mcp",  action="store_true", help="检测外部 MCP 可用性")
    parser.add_argument("--disable-broken", action="store_true", help="配合 --setup-mcp: 自动禁用不可用 MCP")
    parser.add_argument("--with-data",  action="store_true", help="查看带数据迁移说明")
    args = parser.parse_args()

    if args.with_data:
        print("""
带数据迁移 (保留记忆/资产/漏洞库):
  1. 旧机停服: taskkill /F /IM desredteam.exe
  2. 拷贝旧机 data\\ 四件套到本机 data\\:
       conversations.db  conversations.db-wal  conversations.db-shm  conversation_artifacts\\
  3. 如旧机 knowledge_base\\ 有自定义内容, 一并拷贝
  4. 启动后立即: 重置 admin 密码 + 改 gsl5 token
""")
        return

    if args.check:
        se.self_check()
        def count_dir(d, mode):
            dp = os.path.join(SCRIPT_DIR, d)
            if not os.path.isdir(dp):
                return 0
            if mode == "subdir":  # skills: 每子目录一个技能
                return len([x for x in os.listdir(dp) if os.path.isdir(os.path.join(dp, x))])
            if mode == "yaml":    # tools/roles: yaml 定义
                return len([x for x in os.listdir(dp) if x.endswith((".yaml", ".yml"))])
            return len([x for x in os.listdir(dp) if x.endswith(".md")])  # agents: md 编排
        for label, d, mode in (("平台 Skills", "skills", "subdir"), ("工具定义", "tools", "yaml"),
                               ("角色定义", "roles", "yaml"), ("编排 Agent", "agents", "md")):
            n = count_dir(d, mode)
            print(f"  [OK] {label}: {d}/ {n} 个 (解压即用, 启动自动扫描)")
        return
    if args.stop:
        stop(); return
    if args.fix_config:
        fix_config(); return
    if args.setup_mcp:
        setup_mcp(disable_broken=args.disable_broken); return

    # 默认: 一键初始化 + 启动
    print("========== DesRedTeam 一键初始化 ==========")
    ensure_dirs()
    ensure_config()
    se.self_check()
    exe = find_exe()
    if not exe:
        print("  [失败] 主程序不存在, 请完整解压本包")
        return
    # 提示密钥
    if not se.get_user_env("DEEPSEEK_API_KEY"):
        print("\n  [提示] DEEPSEEK_API_KEY 未配置, 运行 setup_env.py 配置密钥 (AI 通道必需)")
    if args.restart:
        stop(); time.sleep(1)
    start()
    print("  完成。浏览器访问 http://127.0.0.1:8080/  (admin 密码见日志)")

if __name__ == "__main__":
    main()
