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
npm run dev
```

## 接口
- GET /api/devices
- GET /api/metrics
- POST /api/telemetry
- WS /ws/telemetry
