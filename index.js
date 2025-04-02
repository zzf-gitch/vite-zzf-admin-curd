const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const cors = require('cors');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());
// 配置静态文件服务
app.use('/images', express.static(path.join(__dirname, 'assets', 'images')));
const uploadDir = path.join(__dirname, 'assets', 'images');

// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 Multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const { type } = req.body;
    cb(null, `${type}.jpg`);
  }
});

// 创建 Multer 实例
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 限制
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// 上传路由
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const outputPath = path.join(uploadDir, `${req.body.type}.jpg`);
      const unlinkAsync = promisify(fs.unlink);
      const readFileAsync = promisify(fs.readFile);

      try {
        // 如果文件已存在，先删除
        try {
          await unlinkAsync(outputPath);
        } catch (error) {
          // 忽略文件不存在的错误
        }

        // 读取上传的文件
        const imageBuffer = await readFileAsync(req.file.path);

        // 使用sharp处理图片
        await sharp(imageBuffer)
          .rotate() // 自动旋转
          .resize(1920, 1080, { // 限制最大尺寸
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 85 }) // 适当提高质量
          .toFile(outputPath);

        // 删除临时文件
        await unlinkAsync(req.file.path);

        res.json({
          code: 0,
          success: true,
          message: '上传成功',
          imageUrl: `/images/${req.body.type}.jpg`
        });
      } catch (processError) {
        // 如果处理过程中出错，确保清理临时文件
        try {
          await unlinkAsync(req.file.path);
        } catch (cleanupError) {
          console.error('清理临时文件失败:', cleanupError);
        }
        throw processError;
      }
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({
        success: false,
        message: '上传失败'
      });
    }
  });

// 错误处理中间件
app.use((err, req, res, next) => {
  res.status(400).json({
    success: false,
    message: err.message
  });
});

// 启动服务器
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`服务运行中：http://localhost:${PORT}`);
});