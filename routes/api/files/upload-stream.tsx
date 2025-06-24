import { Handlers } from 'fresh/server.ts';

import { Directory, DirectoryFile, FreshContextState } from '/lib/types.ts';
import { DirectoryModel, FileModel } from '/lib/models/files.ts';

interface Data {}

export interface ResponseBody {
  success: boolean;
  newFiles: DirectoryFile[];
  newDirectories: Directory[];
}

// 直接流式处理上传，避免FormData的内存占用
export const handler: Handlers<Data, FreshContextState> = {
  async POST(request, context) {
    if (!context.state.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 从headers获取文件信息
    const fileName = request.headers.get('x-file-name');
    const parentPath = request.headers.get('x-parent-path') || '/';
    const pathInView = request.headers.get('x-path-in-view') || '/';

    if (
      !fileName || !parentPath.startsWith('/') ||
      parentPath.includes('../') || !pathInView.startsWith('/') || pathInView.includes('../')
    ) {
      return new Response('Bad Request', { status: 400 });
    }

    // 直接使用request.body流，避免FormData的内存占用
    if (!request.body) {
      return new Response('No file content', { status: 400 });
    }

    console.log(`开始流式上传: ${fileName}`);
    
    // 使用流式处理
    const createdFile = await FileModel.createFromStream(
      context.state.user.id, 
      parentPath, 
      fileName.trim(), 
      request.body
    );

    console.log(`上传完成: ${fileName}, 成功: ${createdFile}`);

    const newFiles = await FileModel.list(context.state.user.id, pathInView);
    const newDirectories = await DirectoryModel.list(context.state.user.id, pathInView);

    const responseBody: ResponseBody = { success: createdFile, newFiles, newDirectories };

    return new Response(JSON.stringify(responseBody));
  },
}; 