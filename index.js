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
    // 为每个文件生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.jpg');
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

// 处理单个文件的函数
async function processSingleFile(file, type, uploadDir, index = 0) {
  // 如果没有提供type，则使用文件原始名称
  const fileName = type || file.originalname.split('.')[0] || `file-${index}`;
  const outputPath = path.join(uploadDir, `${fileName}.jpg`);
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
    const imageBuffer = await readFileAsync(file.path);

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
    await unlinkAsync(file.path);

    return `/images/${fileName}.jpg`;
  } catch (processError) {
    // 如果处理过程中出错，确保清理临时文件
    try {
      await unlinkAsync(file.path);
    } catch (cleanupError) {
      console.error('清理临时文件失败:', cleanupError);
    }
    throw processError;
  }
}

// 处理多个文件的函数
async function processMultipleFiles(files, types, uploadDir) {
  // 创建处理每个文件的Promise数组
  const processPromises = files.map((file, index) => {
    const type = Array.isArray(types) ? types[index] : (types || `file-${index}`);
    return processSingleFile(file, type, uploadDir, index);
  });

  // 使用Promise.all并行处理所有文件
  try {
    const imageUrls = await Promise.all(processPromises);
    return imageUrls;
  } catch (error) {
    throw error;
  }
}

// 上传路由 - 支持单文件和多文件上传
app.post('/upload', upload.any(), async (req, res) => {
  try {
    const files = req.files;
    const type = req.body.type;

    // 检查是否有文件上传
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有文件被上传'
      });
    }

    // 处理单文件上传
    if (files.length === 1) {
      try {
        const imageUrl = await processSingleFile(files[0], type, uploadDir);
        res.json({
          code: 0,
          success: true,
          message: '上传成功',
          imageUrl: imageUrl
        });
      } catch (err) {
        throw err;
      }
    } 
    // 处理多文件上传
    else {
      try {
        const types = Array.isArray(req.body.type) ? req.body.type : Array(files.length).fill(type);
        const imageUrls = await processMultipleFiles(files, types, uploadDir);
        res.json({
          code: 0,
          success: true,
          message: '批量上传成功',
          imageUrls: imageUrls
        });
      } catch (err) {
        throw err;
      }
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      message: '上传失败: ' + err.message
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
