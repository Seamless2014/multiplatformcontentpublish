#!/usr/bin/env bash
# GitHub 推送辅助脚本
#
# 背景：本机网络对 github.com 存在 DNS 污染（域名被解析为 127.0.0.1），
#      但用真实 IP 直连可通。本脚本自动完成「IP 直连 + 绕过代理」推送。
#
# 用法：bash scripts/git-push.sh [分支名]     默认 main
set -e

BRANCH="${1:-main}"
# github.com 真实 IP 候选（可用 DoH 重新查询：
#   curl -s 'https://223.5.5.5/resolve?name=github.com&type=A' ）
IP_CANDIDATES=("20.27.177.113" "20.205.243.166")
REMOTE_URL="https://github.com/Seamless2014/multiplatformcontentpublish.git"

cd "$(dirname "$0")/.."

# ── 1. 选一个当前可连通的 IP ──
PICKED=""
for ip in "${IP_CANDIDATES[@]}"; do
  if curl -s --resolve "github.com:443:${ip}" -o /dev/null -w "" \
       --max-time 10 --noproxy "*" https://github.com 2>/dev/null; then
    PICKED="$ip"; echo "选用 IP: $ip"; break
  fi
  echo "IP $ip 不可达，尝试下一个..."
done
if [ -z "$PICKED" ]; then
  echo "错误：所有候选 IP 均不可达。请用 DoH 查询最新 IP 后更新 IP_CANDIDATES。"
  echo "  curl -s 'https://223.5.5.5/resolve?name=github.com&type=A'"
  exit 1
fi

IP_URL="https://${PICKED}/Seamless2014/multiplatformcontentpublish.git"
cleanup() {
  git config --local --unset url."${IP_URL}/".insteadOf 2>/dev/null || true
  git config --local --unset http."https://${PICKED}/".sslVerify 2>/dev/null || true
  git config --local --unset credential.helper 2>/dev/null || true
}
trap cleanup EXIT

echo "[1/3] 临时启用 IP 直连重写（推送后自动还原）"
git config --local url."${IP_URL}/".insteadOf "${REMOTE_URL}/"
git config --local http."https://${PICKED}/".sslVerify false
# 关键：显式指定 credential.helper，且不要设置 GIT_TERMINAL_PROMPT=0
# —— 后者会阻止凭据管理器读取已保存的凭据，报 "could not read Username"
git config --local credential.helper "manager"

echo "[2/3] 绕过代理推送 $BRANCH ..."
# 必须清空 http(s)_proxy —— 否则 Git 走 CONNECT 隧道，代理返回 502
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    timeout 180 git push -u origin "$BRANCH"

echo "[3/3] 还原配置"
echo "完成。远程仓库：https://github.com/Seamless2014/multiplatformcontentpublish"
