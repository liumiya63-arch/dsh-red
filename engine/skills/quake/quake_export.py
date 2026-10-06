#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
quake_export.py — Quake 原始数据 → xlsx 导出管线

用法:
  # 1. 从 JSON 文件直接导出 xlsx（推荐，数据已从 Quake JS fetch 获取）
  python quake_export.py --input quake_raw.json --target "目标名" --output report.xlsx

  # 2. 合并多个搜索词的结果再导出
  python quake_export.py --merge data_target.json data_cert.json --target "目标名" --output report.xlsx

字段映射: 见 infogather_report.py 的 6 sheet 格式 (domains/ips/urls/systems/social/todos)
"""

import json, sys, os, argparse
from datetime import datetime

# 修复 stdout 编码（防止中文/emoji在GBK终端报错）
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

# 导入同目录的 infogather 工具
SKILL_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(SKILL_DIR), "infogather"))
sys.path.insert(0, SKILL_DIR)

def parse_quake_records(records: list, target_name: str = "", source_label: str = "Quake360") -> list:
    """
    将 Quake JS fetch 返回的原始记录（带ip/port/hostname/title/service等）
    解析为 infogather_report 可吃的 urls 格式
    去重规则: 相同 (IP, port, title) 只保留一条
    """
    seen = set()
    urls = []
    domains_map = {}
    ips_map = {}
    systems_map = {}
    todos = []

    for r in records:
        ip = r.get("ip", "")
        port = str(r.get("port", 0))
        title = (r.get("title") or "").strip()
        hostname = (r.get("hostname") or "").strip()
        service = (r.get("service") or "").strip()
        location = (r.get("location") or "").strip()
        isp = (r.get("isp") or "").strip()
        status = r.get("status", 0)
        cert_org = (r.get("cert_org") or "").strip()

        key = f"{ip}:{port}|{title}"
        if key in seen:
            continue
        seen.add(key)

        scheme = "https" if port in ("443", "8443", "9443") else "http"
        url = f"{scheme}://{ip}:{port}"

        # 备注识别
        note = ""
        if "JumpServer" in title or "堡垒机" in title:
            note = "⚠️堡垒机"
        elif "日志" in title or "LogViewer" in title:
            note = "⚠️日志查看器"
        elif "Swagger" in title or "swagger" in title.lower() or "API文档" in title or "接口文档" in title:
            note = "⭐API文档"
        elif "后台" in title or "管理" in title:
            note = "管理后台"
        elif "登录" in title or "login" in title.lower() or "Login" in title:
            note = "登录页"
        elif not title:
            note = ""
        elif "nginx" in title.lower() or "openresty" in title.lower():
            note = "默认页"

        # 状态码标注
        accessible = "公网可达"
        if status and status != 200:
            if status == 403:
                accessible = "❌ 403 Forbidden"
                note = "需认证"
            elif status == 404:
                accessible = "❌ 404 Not Found"
            elif status == 502:
                accessible = "❌ 502 Bad Gateway"
                note = "测试环境"

        urls.append({
            "url": url,
            "system": title or f"端口{port}服务",
            "accessible": accessible,
            "ip": ip,
            "source": source_label,
            "note": note.strip()
        })

        # IP 去重
        if ip and ip not in ips_map:
            ips_map[ip] = {
                "ip": ip,
                "domain": hostname or "",
                "location": location,
                "isp": isp,
                "type": "Quake发现",
                "source": source_label
            }

        # 域名去重
        if hostname and hostname not in domains_map:
            domains_map[hostname] = {
                "domain": hostname,
                "unit": target_name,
                "ip": ip,
                "source": source_label,
                "note": title or ""
            }

        # 系统去重
        if title and title not in systems_map:
            systems_map[title] = {
                "system": title,
                "tech": f"{service} {cert_org}".strip(),
                "unit": target_name,
                "ports": port,
                "source": source_label
            }
        elif title:
            existing = systems_map[title]["ports"]
            if port not in existing.split("/"):
                systems_map[title]["ports"] += f"/{port}"

    # 自动生成待办
    high_items = [u for u in urls if u["note"].startswith("⚠️") or u["note"].startswith("⭐")]
    for item in high_items[:5]:
        todos.append({
            "priority": "⭐⭐⭐",
            "action": f"{item['note']} — {item['system']} ({item['url']})"
        })
    if urls:
        todos.append({
            "priority": "⭐⭐",
            "action": f"测试 {len(urls)} 个公网可达系统的弱口令/默认配置"
        })

    return {
        "domains": list(domains_map.values()),
        "ips": list(ips_map.values()),
        "urls": urls,
        "systems": list(systems_map.values()),
        "social": [
            {"type": "Quake搜索", "content": f"{source_label} 发现", "belong": target_name, "source": source_label}
        ],
        "todos": todos
    }


def merge_datasets(datasets: list) -> dict:
    """合并多个搜索词的 parsed 数据，去重"""
    merged = {"domains": {}, "ips": {}, "urls": set(), "systems": {}, "social": [], "todos": []}
    seen_urls = set()

    for ds in datasets:
        for item in ds.get("domains", []):
            key = item.get("domain", "")
            if key and key not in merged["domains"]:
                merged["domains"][key] = item

        for item in ds.get("ips", []):
            key = item.get("ip", "")
            if key and key not in merged["ips"]:
                merged["ips"][key] = item

        for item in ds.get("urls", []):
            key = f"{item.get('ip','')}:{item.get('url','')}"
            if key not in seen_urls:
                seen_urls.add(key)
                # 用 set 无法存 dict，临时存 list
                if "urls_list" not in merged:
                    merged["urls_list"] = []
                merged["urls_list"].append(item)

        for item in ds.get("systems", []):
            key = item.get("system", "")
            if key and key not in merged["systems"]:
                merged["systems"][key] = item

        merged["todos"].extend(ds.get("todos", []))

    return {
        "domains": list(merged["domains"].values()),
        "ips": list(merged["ips"].values()),
        "urls": merged.get("urls_list", []),
        "systems": list(merged["systems"].values()),
        "social": [],
        "todos": merged["todos"][:10]
    }


def main():
    parser = argparse.ArgumentParser(description="Quake 数据 → xlsx 导出管线")
    parser.add_argument("--input", "-i", help="Quake 原始 JSON 文件路径（JS fetch 返回的 records 数组）")
    parser.add_argument("--merge", "-m", nargs="+", help="合并多个 JSON 文件再导出")
    parser.add_argument("--target", "-t", default="目标", help="目标名称（用于 xlsx 标题）")
    parser.add_argument("--output", "-o", default="quake_report.xlsx", help="输出 xlsx 路径")
    parser.add_argument("--label", "-l", default="Quake360", help="数据来源标签")

    args = parser.parse_args()

    if not args.input and not args.merge:
        parser.print_help()
        print("\n错误: 请提供 --input 或 --merge 参数")
        sys.exit(1)

    # 加载数据
    datasets = []

    if args.merge:
        for fp in args.merge:
            with open(fp, "r", encoding="utf-8") as f:
                raw = json.load(f)
            # 兼容两种格式：顶层 list 或 {records: [...]}
            records = raw if isinstance(raw, list) else raw.get("records", [])
            print(f"  加载 {fp}: {len(records)} 条记录")
            parsed = parse_quake_records(records, args.target, args.label)
            datasets.append(parsed)

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            raw = json.load(f)
        records = raw if isinstance(raw, list) else raw.get("records", [])
        print(f"  加载 {args.input}: {len(records)} 条记录")
        parsed = parse_quake_records(records, args.target, args.label)
        datasets.append(parsed)

    # 合并
    report_data = merge_datasets(datasets) if len(datasets) > 1 else datasets[0]

    print(f"\n数据汇总:")
    print(f"  domains: {len(report_data['domains'])}")
    print(f"  ips: {len(report_data['ips'])}")
    print(f"  urls: {len(report_data['urls'])}")
    print(f"  systems: {len(report_data['systems'])}")
    print(f"  todos: {len(report_data['todos'])}")

    # 保存中间 JSON
    json_path = args.output.replace(".xlsx", ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, ensure_ascii=False, indent=2)
    print(f"\n中间 JSON 保存到: {json_path}")

    # 调用 infogather_report.py 生成 xlsx
    report_script = os.path.join(os.path.dirname(SKILL_DIR), "infogather", "infogather_report.py")
    if os.path.exists(report_script):
        cmd = f'python "{report_script}" --target "{args.target}" --input "{json_path}" --output "{args.output}"'
        print(f"\n执行: {cmd}")
        ret = os.system(cmd)
        if ret == 0:
            print(f"\n[OK] xlsx 报告已生成: {args.output}")
        import sys
        # 强制 stdout 编码
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        else:
            print(f"\n⚠️ infogather_report.py 执行返回 {ret}")
    else:
        print(f"\n⚠️ 找不到 {report_script}")
        print(f"   请手动: python infogather_report.py --target '{args.target}' --input '{json_path}' --output '{args.output}'")


if __name__ == "__main__":
    main()
