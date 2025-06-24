/**
 * 流式 multipart/form-data 解析器
 * 避免将整个文件加载到内存中
 */

export interface MultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  value?: string;
  stream?: ReadableStream<Uint8Array>;
}

export async function* parseMultipartStream(
  request: Request
): AsyncGenerator<MultipartField> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('multipart/form-data')) {
    throw new Error('Not a multipart request');
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('No boundary found');
  }

  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  const endBoundaryBytes = new TextEncoder().encode(`--${boundary}--`);
  
  if (!request.body) {
    return;
  }

  const reader = request.body.getReader();
  let buffer = new Uint8Array(0);
  let done = false;

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    
    if (value) {
      // 合并到缓冲区
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
    }

    // 查找边界
    let boundaryIndex = findBoundary(buffer, boundaryBytes);
    
    while (boundaryIndex !== -1) {
      // 处理边界前的数据
      if (boundaryIndex > 0) {
        const partData = buffer.slice(0, boundaryIndex);
        const field = await parseMultipartPart(partData);
        if (field) {
          yield field;
        }
      }

      // 移除已处理的数据
      buffer = buffer.slice(boundaryIndex + boundaryBytes.length);
      
      // 查找下一个边界
      boundaryIndex = findBoundary(buffer, boundaryBytes);
    }

    // 检查结束边界
    if (findBoundary(buffer, endBoundaryBytes) !== -1) {
      break;
    }
  }
}

function findBoundary(buffer: Uint8Array, boundary: Uint8Array): number {
  for (let i = 0; i <= buffer.length - boundary.length; i++) {
    let match = true;
    for (let j = 0; j < boundary.length; j++) {
      if (buffer[i + j] !== boundary[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

async function parseMultipartPart(data: Uint8Array): Promise<MultipartField | null> {
  const text = new TextDecoder().decode(data);
  const lines = text.split('\r\n');
  
  let name = '';
  let filename = '';
  let contentType = '';
  let headerEndIndex = -1;

  // 解析headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === '') {
      headerEndIndex = i;
      break;
    }
    
    if (line.toLowerCase().startsWith('content-disposition:')) {
      const nameMatch = line.match(/name="([^"]+)"/);
      if (nameMatch) name = nameMatch[1];
      
      const filenameMatch = line.match(/filename="([^"]+)"/);
      if (filenameMatch) filename = filenameMatch[1];
    }
    
    if (line.toLowerCase().startsWith('content-type:')) {
      contentType = line.split(':')[1].trim();
    }
  }

  if (headerEndIndex === -1) return null;

  // 获取内容
  const content = lines.slice(headerEndIndex + 1).join('\r\n');
  
  if (filename) {
    // 文件字段 - 创建流
    const contentBytes = new TextEncoder().encode(content);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(contentBytes);
        controller.close();
      }
    });
    
    return {
      name,
      filename,
      contentType,
      stream
    };
  } else {
    // 普通字段
    return {
      name,
      value: content
    };
  }
} 