# RISC-V UI

## 前后端分离启动

### 后端
```
cd backend
npm install
FRONTEND_ORIGIN=http://localhost:5173 npm run dev
```

### 前端
```
npm install
npm run dev
```

前端通过 `.env` 中的 `VITE_API_BASE` / `VITE_WS_URL` 访问后端。
