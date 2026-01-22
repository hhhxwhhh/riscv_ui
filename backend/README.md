# riscv-ui backend (Node.js)

## 目录结构
```
backend/
  src/
    server.js
  package.json
  README.md
```

## 启动
```
cd backend
npm install
FRONTEND_ORIGIN=http://localhost:5173 npm run dev
```

## 环境变量
- PORT: 后端端口（默认 8080）
- FRONTEND_ORIGIN: 允许访问的前端地址（逗号分隔）

## 接口
- GET /api/devices
- GET /api/metrics
- POST /api/telemetry
- WS /ws/telemetry
