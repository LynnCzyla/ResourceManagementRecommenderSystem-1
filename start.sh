#!/bin/sh
# Launches the warm daemon (spaCy/sklearn/Supabase pre-loaded, single
# long-lived SkillClassifier - see python/scripts/daemon.py) in the
# background, then runs Node as PID 1 so container signals (Render
# restarts/redeploys) are handled correctly by the process Render actually
# cares about.
#
# If the daemon crashes, Node keeps running and pythonService.js falls back
# to its per-request spawn() path automatically - degraded but not broken.
# If Node crashes, the container exits and Render restarts the whole thing
# (which also takes the background daemon down with it - fine, a fresh one
# starts on the next boot).
set -e

echo "[start.sh] Launching Python daemon..."
python/venv/bin/python python/scripts/daemon.py &

echo "[start.sh] Launching Node backend..."
exec node backend/server.js
