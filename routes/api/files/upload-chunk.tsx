import { Handlers } from 'fresh/server.ts';
import { join } from 'std/path/mod.ts';

import { Directory, DirectoryFile, FreshContextState } from '/lib/types.ts';
import { DirectoryModel, FileModel } from '/lib/models/files.ts';
import { AppConfig } from '/lib/config.ts';

interface Data {}

export interface ResponseBody {
  success: boolean;
  isComplete?: boolean;
  newFiles?: DirectoryFile[];
  newDirectories?: Directory[];
}

// 分块上传端点 - 内存友好
export const handler: Handlers<Data, FreshContextState> = {
  async POST(request, context) {
    if (!context.state.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 从headers获取分块信息 (需要URL解码)
    const fileName = request.headers.get('x-file-name') ? decodeURIComponent(request.headers.get('x-file-name')!) : null;
    const parentPath = request.headers.get('x-parent-path') ? decodeURIComponent(request.headers.get('x-parent-path')!) : '/';
    const pathInView = request.headers.get('x-path-in-view') ? decodeURIComponent(request.headers.get('x-path-in-view')!) : '/';
    const chunkIndex = parseInt(request.headers.get('x-chunk-index') || '0');
    const totalChunks = parseInt(request.headers.get('x-total-chunks') || '1');
    const fileId = request.headers.get('x-file-id') ? decodeURIComponent(request.headers.get('x-file-id')!) : fileName; // 唯一标识符

    if (
      !fileName || !fileId || !parentPath.startsWith('/') ||
      parentPath.includes('../') || !pathInView.startsWith('/') || pathInView.includes('../')
    ) {
      return new Response('Bad Request', { status: 400 });
    }

    const tempDir = join(await AppConfig.getFilesRootPath(), '.chunks', context.state.user.id, fileId);
    const chunkPath = join(tempDir, `chunk_${chunkIndex}`);

    try {
      // 确保临时目录存在
      await Deno.mkdir(tempDir, { recursive: true });

      // 保存当前块 - 使用极小的内存
      if (request.body) {
        const file = await Deno.open(chunkPath, {
          create: true,
          write: true,
          truncate: true,
        });

        const reader = request.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            if (value) {
              await file.write(value);
            }
          }
        } finally {
          reader.releaseLock();
          file.close();
        }

        console.log(`保存块 ${chunkIndex}/${totalChunks} 文件: ${fileName}`);
      }

      // 检查是否所有块都已上传
      const allChunksUploaded = await checkAllChunksUploaded(tempDir, totalChunks);
      
      if (allChunksUploaded) {
        // 组装文件
        console.log(`开始组装文件: ${fileName}`);
        const success = await assembleFile(
          context.state.user.id,
          parentPath,
          fileName,
          tempDir,
          totalChunks
        );

        if (success) {
          // 清理临时文件
          await Deno.remove(tempDir, { recursive: true });
          
          const newFiles = await FileModel.list(context.state.user.id, pathInView);
          const newDirectories = await DirectoryModel.list(context.state.user.id, pathInView);

          const responseBody: ResponseBody = { 
            success: true, 
            isComplete: true,
            newFiles, 
            newDirectories 
          };

          console.log(`文件组装完成: ${fileName}`);
          return new Response(JSON.stringify(responseBody));
        }
      }

      // 块上传成功，但文件未完成
      const responseBody: ResponseBody = { success: true, isComplete: false };
      return new Response(JSON.stringify(responseBody));

    } catch (error) {
      console.error('分块上传错误:', error);
      return new Response('Upload failed', { status: 500 });
    }
  },
};

async function checkAllChunksUploaded(tempDir: string, totalChunks: number): Promise<boolean> {
  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(tempDir, `chunk_${i}`);
      try {
        await Deno.stat(chunkPath);
      } catch {
        return false; // 块不存在
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function assembleFile(
  userId: string,
  parentPath: string,
  fileName: string,
  tempDir: string,
  totalChunks: number
): Promise<boolean> {
  const rootPath = join(await AppConfig.getFilesRootPath(), userId, parentPath);
  const finalPath = join(rootPath, fileName);

  try {
    // 确保目标目录存在
    await Deno.mkdir(rootPath, { recursive: true });

    const finalFile = await Deno.open(finalPath, {
      create: true,
      write: true,
      truncate: true,
    });

    try {
      // 按顺序组装块
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = join(tempDir, `chunk_${i}`);
        const chunkFile = await Deno.open(chunkPath, { read: true });
        
        try {
          // 复制块内容，使用小缓冲区
          const buffer = new Uint8Array(64 * 1024); // 64KB缓冲区
          
          while (true) {
            const bytesRead = await chunkFile.read(buffer);
            if (bytesRead === null) break;
            
            await finalFile.write(buffer.slice(0, bytesRead));
          }
        } finally {
          chunkFile.close();
        }
      }
    } finally {
      finalFile.close();
    }

    return true;
  } catch (error) {
    console.error('文件组装失败:', error);
    return false;
  }
} 