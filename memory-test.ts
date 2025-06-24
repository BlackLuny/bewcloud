#!/usr/bin/env -S deno run --allow-all

/**
 * Memory Test Script for bewCloud file upload
 * 用于测试文件上传时的内存使用情况
 */

// 模拟大文件上传测试
async function testFileUploadMemory() {
  console.log('🧪 Starting memory test for file upload...');
  
  const initialMemory = getMemoryUsage();
  console.log(`📊 Initial memory usage: ${formatBytes(initialMemory.rss)}`);

  // 创建测试文件数据（10MB）
  const testData = new Uint8Array(10 * 1024 * 1024);
  testData.fill(65); // 填充字符 'A'
  
  console.log(`📁 Created test data: ${formatBytes(testData.byteLength)}`);
  
  for (let i = 0; i < 5; i++) {
    console.log(`\n🔄 Upload test ${i + 1}/5`);
    
    const beforeUpload = getMemoryUsage();
    console.log(`  Before: ${formatBytes(beforeUpload.rss)}`);
    
    // 模拟文件上传过程
    await simulateFileUpload(testData);
    
    const afterUpload = getMemoryUsage();
    console.log(`  After:  ${formatBytes(afterUpload.rss)}`);
    console.log(`  Delta:  ${formatBytes(afterUpload.rss - beforeUpload.rss)}`);
    
    // 强制垃圾回收
    if (globalThis.gc) {
      globalThis.gc();
      const afterGC = getMemoryUsage();
      console.log(`  After GC: ${formatBytes(afterGC.rss)}`);
    }
    
    // 等待一秒
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const finalMemory = getMemoryUsage();
  console.log(`\n📈 Final memory usage: ${formatBytes(finalMemory.rss)}`);
  console.log(`📈 Total memory increase: ${formatBytes(finalMemory.rss - initialMemory.rss)}`);
}

async function simulateFileUpload(data: Uint8Array) {
  // 模拟 FormData 处理
  const formData = new FormData();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  formData.set('contents', blob, 'test-file.bin');
  
  // 模拟流处理
  const file = formData.get('contents') as File;
  const stream = file.stream();
  
  // 模拟写入文件的流处理
  const writerStream = new WritableStream({
    write(chunk) {
      // 模拟写入操作
      return Promise.resolve();
    }
  }, {
    highWaterMark: 64 * 1024 // 64KB buffer
  });
  
  await stream.pipeTo(writerStream);
}

function getMemoryUsage() {
  return Deno.memoryUsage();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// 运行测试
if (import.meta.main) {
  console.log('🚀 bewCloud Memory Test\n');
  console.log('ℹ️  Run with: deno run --allow-all --v8-flags=--expose-gc memory-test.ts');
  console.log('ℹ️  This will test memory usage during file upload simulation\n');
  
  await testFileUploadMemory();
  
  console.log('\n✅ Memory test completed!');
  console.log('💡 Tips for reducing memory usage:');
  console.log('   - Use streaming for large files');
  console.log('   - Set appropriate highWaterMark for streams');
  console.log('   - Force garbage collection after processing');
  console.log('   - Avoid keeping references to large objects');
} 