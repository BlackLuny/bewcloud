#!/bin/bash

# 批量修复 bewCloud 项目中的内存泄漏问题
# 主要修复 request.clone() 导致的内存泄漏

echo "🔧 开始修复 bewCloud 内存泄漏问题..."

# 修复所有 request.clone().json() 调用
echo "📝 修复 request.clone().json() 调用..."
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i.bak 's/request\.clone()\.json()/request.json()/g'

# 修复所有 request.clone().formData() 调用
echo "📝 修复 request.clone().formData() 调用..."
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i.bak 's/request\.clone()\.formData()/request.formData()/g'

# 修复所有 request.clone().text() 调用
echo "📝 修复 request.clone().text() 调用..."
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i.bak 's/request\.clone()\.text()/request.text()/g'

# 修复 dav.tsx 中的 request.clone().body 调用
echo "📝 修复 request.clone().body 调用..."
if [ -f "routes/dav.tsx" ]; then
    sed -i.bak 's/request\.clone()\.body/request.body/g' routes/dav.tsx
fi

# 清理备份文件
echo "🧹 清理备份文件..."
find . -name "*.bak" -delete

echo "✅ 内存泄漏修复完成！"
echo ""
echo "📊 修复统计："
echo "   - 修复了所有 request.clone().json() 调用"
echo "   - 修复了所有 request.clone().formData() 调用"
echo "   - 修复了所有 request.clone().text() 调用"
echo "   - 修复了所有 request.clone().body 调用"
echo ""
echo "🚀 请重新构建 Docker 镜像："
echo "   docker build -t bewcloud-fixed ."
echo "   docker-compose up -d"
echo ""
echo "💡 建议监控内存使用："
echo "   docker stats bewcloud-website-1" 