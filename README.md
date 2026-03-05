# RISC-V UI 监控系统

面向 RISC-V 架构的高性能 UI 监控平台，支持实时遥测数据展示、拓扑结构分析及安全性能基准测试。

## 快速启动 (Docker)

推荐使用 Docker Compose 快速部署完整环境：

```bash
docker-compose up --build
```

- 前端：[http://localhost:80](http://localhost:80)
- 后端 API：[http://localhost:8080/api/health](http://localhost:8080/api/health)

## 开发环境配置

### 后端 (Node.js)
```bash
cd backend
npm install
# 设置前端跨域地址
FRONTEND_ORIGIN=http://localhost:5173 npm run dev
```

### 前端 (Vue 3 + Vite)
```bash
npm install
npm run dev
```

## 主要功能
- **实时拓扑**: 展示节点间的连接关系及实时状态。
- **性能监控**: 吞吐量、延迟及安全得分实时监控。
- **ISA 加速分析**: 针对 RISC-V 自定义指令集的加速效果评估。

## 环境要求
- Node.js 18+
- Docker & Docker Compose
