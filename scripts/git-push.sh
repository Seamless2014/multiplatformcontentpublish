#!/usr/bin/env bash
# GitHub 推送辅助脚本
# 背景：本机网络对 github.com 存在 DNS 污染（域名被解析为 127.0.0.1），
#      但用真实 IP 直连可通。本脚本自动完成「IP 直连 + 绕过代理」推送。
#
# 用法：bash scripts/git-push.sh [分支名]     默认 main
set -e

BRANCH="${1:-main}"
GITHUB_IP="20.205.243.166"   # github.com 真实 IP（可用 DoH 重新查询）
REMOTE_URL="https://github.com/Seamless2014/multiplatformcontentpublish.git"
IP_URL="https://${GITHUB_IP}/Seamless2014/multiplatformcontentpublish.git"

cd "$(dirname "$0")/.."

echo "[1/3] 临时启用 IP 直连重写（推送后自动还原）"
git config --local url."${IP_URL}/".insteadOf "${REMOTE_URL}/" 2>/dev/null || \
  git config --local url."${IP_URL}".insteadOf "${REMOTE_URL}"
git config --local http."https://${GITHUB_IP}/".sslVerify false

echo "[2/3] 绕过代理推送 $BRANCH ..."
# 关键：必须清空 http(s)_proxy —— 否则 Git 会走 CONNECT 隧道，代理返回 502
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    GIT_TERMINAL_PROMPT=0 \
    git push -u origin "$BRANCH"

echo "[3/3] 还原配置"
git config --local --unset url."${IP_URL}/".insteadOf 2>/dev/null || true
git config --local --unset url."${IP_URL}".insteadOf 2>/dev/null || true
git config --local --unset http."https://${GITHUB_IP}/".sslVerify 2>/dev/null || true

echo "完成。远程仓库：https://github.com/Seamless2014/multiplatformcontentpublish"
