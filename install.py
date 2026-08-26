#!/usr/bin/env python3
"""
install.py — 把 dsh-pet-hermes（pet 2.0 beta）部署到本机的 DSH web profile。

跨设备通用：自动探测 DSH profile 路径与插件源码位置，不依赖任何写死的盘符路径。
给"已部署 DSH + Hermes 的同事"在自己设备上快速装上、看效果用。

用法：
    python install.py            # 部署（拷 lib/assets/清单 + 加注册行）
    python install.py --check    # 只检查当前部署状态，不改动
    python install.py --uninstall# 移除本插件（删部署目录 + 还原注册行）

流程（幂等，可重复跑）：
    1. 探测 DSH profile（~/.dsh/profiles/web）
    2. 检查 DSH 是否已停（没停则警告：文件锁会导致覆盖失败）
    3. 拷贝 lib/ assets/ package.json cordis.patch.yml 到 profile 的 node_modules
    4. 幂等地把 pet-hermes 注册行进 profile 的 cordis.patch.yml（已有则跳过）
    5. 检查 token.txt（Hermes key）是否就位
    6. 提示：重启 DSH + 自检命令

前提：
    - 本机已装 DSH（有 ~/.dsh/profiles/web）
    - 本插件已构建过（本目录有 lib/；没有就先 `npm run build`）
    - 本机有 Hermes 在跑（对话用；没有的话桌宠会出现但"大脑离线"）
"""

import os
import re
import shutil
import sys
from pathlib import Path

# Windows 中文控制台默认 GBK，Unicode 符号(✓/✗/⚠)会 UnicodeEncodeError。
# 把 stdout 强制成 UTF-8 容错，避免任何编码崩溃。
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PLUGIN_NAME = "dsh-pet-hermes"
CORDIS_ID = "pet-hermes"
# 注册行（YAML，和 mcp-browser 那行并列插进顶层数组）
REGISTER_LINE = " { insert: [ { id: %s, name: '%s' } ] }" % (CORDIS_ID, PLUGIN_NAME)

# 需要拷进 profile 的产物（相对插件根）
COPY_ITEMS = ["lib", "assets", "package.json", "cordis.patch.yml"]


def dsh_profile_dir() -> Path:
    """探测 DSH web profile 目录（跨平台：~/.dsh/profiles/web）。"""
    return Path(os.path.expanduser("~")) / ".dsh" / "profiles" / "web"


def plugin_root() -> Path:
    """插件源码根 = 本脚本所在目录。"""
    return Path(__file__).resolve().parent


def find_dsh_running() -> bool:
    """粗略检测是否有 DSH 进程在跑（跨平台尽力而为，检测不到不阻塞）。"""
    try:
        import subprocess
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | "
             "Where-Object { $_.CommandLine -match '@deepseek-ai/dsh' -or "
             "$_.CommandLine -match 'dsh.*bin.js' } | "
             "Select-Object -ExpandProperty ProcessId"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip()
        return bool(out)
    except Exception:
        return False  # 非 Windows 或检测失败：不阻塞，靠用户自觉


def ensure_built(root: Path) -> bool:
    lib = root / "lib" / "index.js"
    client = root / "lib" / "client.js"
    if lib.exists() and client.exists():
        return True
    print("[!] 未检测到构建产物 lib/index.js 或 lib/client.js。")
    print("   请先在本目录构建：  npm install && npm run build")
    return False


def copy_into_profile(root: Path, profile: Path) -> None:
    dst = profile / "node_modules" / PLUGIN_NAME
    dst.mkdir(parents=True, exist_ok=True)
    for item in COPY_ITEMS:
        src = root / item
        if not src.exists():
            print(f"   跳过（不存在）: {item}")
            continue
        target = dst / item
        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        if src.is_dir():
            shutil.copytree(src, target)
        else:
            shutil.copy2(src, target)
        print(f"   拷贝 {item} → {target}")
    print(f"[2/4] 已部署到 {dst}")


def update_register_line(profile: Path) -> None:
    """幂等地把 pet-hermes 注册行加进 profile 的 cordis.patch.yml。"""
    patch = profile / "cordis.patch.yml"
    if not patch.exists():
        print(f"[!] 未找到 {patch}，无法加注册行。请手动确认 DSH profile 结构。")
        return
    text = patch.read_text(encoding="utf-8")
    if CORDIS_ID in text:
        print(f"[3/4] cordis.patch.yml 已含 {CORDIS_ID} 注册行，跳过")
        return
    # 备份
    bak = patch.with_suffix(patch.suffix + ".bak-pet-hermes")
    if not bak.exists():
        shutil.copy2(patch, bak)
        print(f"   已备份 → {bak.name}")
    # 顶层是 [ { ... } ] 单行/多行数组；在第一个 " insert:" 前插入本插件行。
    # 最稳：找到数组开头 "["，在其后插入 " { insert: [pet-hermes] },"
    if "[" in text:
        idx = text.index("[") + 1
        # 跳过 [ 后的空白
        new_text = text[:idx] + " " + REGISTER_LINE + "," + text[idx:]
    else:
        # 没有数组包裹（异常结构）：追加一个独立数组元素
        new_text = text.rstrip() + "\n" + REGISTER_LINE + "\n"
    patch.write_text(new_text, encoding="utf-8")
    print(f"[3/4] 已把 {CORDIS_ID} 注册行写入 {patch.name}")


def check_token(root: Path, dst: Path) -> None:
    """检查 token.txt（Hermes key）是否在部署目录就位。"""
    token = dst / "token.txt"
    if token.exists() and token.read_text(encoding="utf-8").strip():
        print(f"[4/4] token.txt 就位 [OK]  ({token})")
    else:
        print(f"[4/4] [!] 部署目录还没有 token.txt（你的 Hermes API key）。")
        print(f"      请把你的 Hermes key 写入（一整行，无引号）：\n        {token}")
        print("      或用 settings.yaml 的 tokenFile 指向你的 key 文件。")


def uninstall(profile: Path) -> None:
    dst = profile / "node_modules" / PLUGIN_NAME
    if dst.exists():
        shutil.rmtree(dst)
        print(f"已删除部署目录 {dst}")
    patch = profile / "cordis.patch.yml"
    if patch.exists():
        text = patch.read_text(encoding="utf-8")
        # 移除本插件的注册行（匹配 " { insert: [ { id: pet-hermes ... } ] }" 含前后逗号）
        pattern = r",?\s*\{\s*insert:\s*\[\s*\{\s*id:\s*%s\b.*?\}\s*\]\s*\}" % re.escape(CORDIS_ID)
        new_text, n = re.subn(pattern, "", text)
        if n:
            patch.write_text(new_text, encoding="utf-8")
            print(f"已从 {patch.name} 移除 {CORDIS_ID} 注册行")
        else:
            print(f"cordis.patch.yml 里没找到 {CORDIS_ID} 注册行")
    print("卸载完成。重启 DSH 生效。")


def check_status(root: Path, profile: Path) -> None:
    ok, no = "[OK]", "[NO]"
    print(f"插件源码:   {root}")
    print(f"DSH profile: {profile}  {ok if profile.exists() else no + ' 不存在'}")
    dst = profile / "node_modules" / PLUGIN_NAME
    print(f"部署目录:   {dst}  {ok + ' 已部署' if dst.exists() else no + ' 未部署'}")
    patch = profile / "cordis.patch.yml"
    if patch.exists():
        registered = CORDIS_ID in patch.read_text(encoding="utf-8")
        print(f"注册行:     {ok + ' 已注册' if registered else no + ' 未注册'}  ({patch.name})")
    token = dst / "token.txt"
    print(f"token.txt:  {ok if token.exists() else no + ' 缺失'}")
    print(f"构建产物:   {ok if (root/'lib'/'index.js').exists() else no + ' 需 npm run build'}")


def main() -> int:
    args = sys.argv[1:]
    root = plugin_root()
    profile = dsh_profile_dir()
    dst = profile / "node_modules" / PLUGIN_NAME

    if "--uninstall" in args:
        if not profile.exists():
            print(f"找不到 DSH profile {profile}")
            return 1
        uninstall(profile)
        return 0

    if "--check" in args:
        check_status(root, profile)
        return 0

    # ---- 部署 ----
    print("=== dsh-pet-hermes 部署 ===")
    print(f"[1/4] 检查前置")
    if not profile.exists():
        print(f"   ❌ 找不到 DSH web profile: {profile}")
        print("      本机是否已安装 DSH 并用过 `dsh --profile web`？")
        return 1
    if not ensure_built(root):
        return 1
    if find_dsh_running():
        print("   [!] 检测到 DSH 可能还在运行。请先关闭 DSH（GUI/进程）再部署，")
        print("      否则 lib/*.js 被占用，覆盖会静默失败。")
        try:
            ans = input("   继续吗？(y/N): ").strip().lower()
            if ans != "y":
                print("   已取消。请停 DSH 后重跑。")
                return 1
        except EOFError:
            pass

    print(f"[2/4] 拷贝产物 → {dst}")
    copy_into_profile(root, profile)
    update_register_line(profile)
    check_token(root, dst)

    print()
    print("=== 部署完成 ===")
    print("下一步：")
    print("  1. 确保 token.txt 里是你的 Hermes key（见 [4/4]）")
    print("  2. 启动 DSH:   dsh --profile web")
    print("  3. 自检（另开终端）:  curl http://127.0.0.1:3080/api/pet-hermes/chat-status")
    print("     看到 healthy:true 即连上 Hermes；去 GUI 点桌宠试对话。")
    if not (dst / "token.txt").exists():
        print("\n  [!] 别忘了先放 token.txt，否则桌宠会出现但'大脑离线'。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
