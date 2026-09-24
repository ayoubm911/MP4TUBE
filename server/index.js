/**
 * MP4Tube.video - Express 服务器入口文件
 * 负责启动服务器、配置中间件和路由
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const apiRoutes = require('./routes/api');

// 创建 Express 应用实例
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());  // 允许跨域请求
app.use(express.json({ limit: '50mb' }));  // 解析 JSON 请求体，限制大小为 50MB
app.use(express.urlencoded({ extended: true, limit: '50mb' }));  // 解析 URL 编码数据

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const tag = req.method.padEnd(7);
        console.log(`[req] ${tag} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    });
    next();
});

// 静态文件服务 - 提供前端文件
app.use(express.static(path.join(__dirname, '../public')));

// API 路由
app.use('/api', apiRoutes);

// 根路径 - 返回主页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: '页面未找到'
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);

    // body-parser raises entity.parse.failed when a client sends invalid JSON.
    // Surface a friendly 400 (instead of a generic 500) so users immediately
    // know it's their request that's malformed, not a server bug.
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            error: 'Invalid JSON in request body: ' + err.message,
        });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            error: 'Request body too large',
        });
    }

    res.status(500).json({
        success: false,
        error: '服务器内部错误: ' + err.message
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎬 MP4Tube.video Server Started!                         ║
║                                                           ║
║   📍 Local: http://localhost:${PORT}                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
