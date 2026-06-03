#!/bin/bash
echo "Terminal 1:"
echo "cd backend && cp .env.example .env && ./start.sh"
echo ""
echo "Terminal 2:"
echo "cd frontend && cp .env.example .env.local && npm install && npm run dev"
