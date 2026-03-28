#!/bin/bash
echo "=== Qyou Environment Check ==="
echo "Node: $(node --version)"
echo "Docker socket:"
ls -la ~/.docker/run/docker.sock 2>/dev/null && echo "OK" || echo "MISSING"
echo "Redis reachable:"
nc -zv localhost 6379 2>&1 | tail -1
echo "Postgres reachable:"
nc -zv localhost 5432 2>&1 | tail -1
echo "Port 3001:"
lsof -ti:3001 > /dev/null 2>&1 && echo "IN USE" || echo "FREE"
echo "==============================="
