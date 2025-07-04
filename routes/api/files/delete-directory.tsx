import { Handlers } from 'fresh/server.ts';

import { Directory, FreshContextState } from '/lib/types.ts';
import { DirectoryModel } from '/lib/models/files.ts';

interface Data {}

export interface RequestBody {
  parentPath: string;
  name: string;
}

export interface ResponseBody {
  success: boolean;
  newDirectories: Directory[];
}

export const handler: Handlers<Data, FreshContextState> = {
  async POST(request, context) {
    if (!context.state.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const requestBody = await request.json() as RequestBody;

    if (
      !requestBody.parentPath || !requestBody.name?.trim() || !requestBody.parentPath.startsWith('/') ||
      requestBody.parentPath.includes('../')
    ) {
      return new Response('Bad Request', { status: 400 });
    }

    const deletedDirectory = await DirectoryModel.delete(
      context.state.user.id,
      requestBody.parentPath,
      requestBody.name.trim(),
    );

    const newDirectories = await DirectoryModel.list(context.state.user.id, requestBody.parentPath);

    const responseBody: ResponseBody = { success: deletedDirectory, newDirectories };

    return new Response(JSON.stringify(responseBody));
  },
};
