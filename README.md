# 气球解压互动游戏（三文件版）

## 文件
- `index.html`：网页结构
- `style.css`：页面样式
- `sketch.js`：Three.js 场景、气球动画、MediaPipe 手势识别

## 运行
1. 在 VS Code 打开这个文件夹。
2. 安装 Live Server 扩展。
3. 右键 `index.html` → `Open with Live Server`。
4. 在浏览器允许摄像头权限，点击页面上的“开启摄像头并开始”。

也可以在终端运行 `py -m http.server 8000`（Windows）或 `python3 -m http.server 8000`（macOS/Linux），然后打开 `http://localhost:8000`。

需要联网加载 Three.js、MediaPipe 和手部识别模型。摄像头一般要求 localhost 或 HTTPS。
